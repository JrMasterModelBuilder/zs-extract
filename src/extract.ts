import vm from 'vm';
import url from 'url';

import fetch from 'node-fetch';

import {WINDOW} from './data';

export interface IRequestOptions {
	//
	/**
	 * URL string.
	 */
	url: string;

	/**
	 * Request method.
	 */
	method?: string;

	/**
	 * Request headers.
	 */
	headers?: {[key: string]: string};

	/**
	 * Gzip compression.
	 */
	gzip?: boolean;

	/**
	 * Body encoding used for callback functions.
	 */
	encoding?: string | null;
}

export interface IRequestResponse {
	//
	/**
	 * Status code.
	 */
	statusCode: number;

	/**
	 * Response headers, all lowercase.
	 */
	headers: {[key: string]: string};
}

export type IRequestCallback = (
	error: any,
	response: IRequestResponse,
	body: any
) => void;

export type IRequest = (options: IRequestOptions, cb?: IRequestCallback) => any;

/**
 * The default request implementation.
 *
 * @param options Options object.
 * @param cb Callback function.
 */
function request(options: IRequestOptions, cb: IRequestCallback) {
	let response: IRequestResponse = {
		statusCode: 0,
		headers: {}
	};
	const {encoding} = options;
	(async () => {
		const res = await fetch(options.url, {
			method: options.method || 'GET',
			headers: {
				'User-Agent': '-',
				...(options.headers || {})
			},
			compress: !!options.gzip
		});
		const {status, headers} = res;
		const headersRaw = headers.raw();
		const headersObject: {[key: string]: string} = {};
		for (const p of Object.keys(headersRaw)) {
			headersObject[p] = headersRaw[p].join(', ');
		}
		response = {
			statusCode: status,
			headers: headersObject
		};
		const data = await res.buffer();
		return encoding === null ? data : data.toString(encoding as any);
	})().then(
		data => {
			cb(null, response, data);
		},
		err => {
			cb(err, response, null);
		}
	);
}

/**
 * A request promise wrapper.
 *
 * @param req Request function.
 * @param options Request options.
 * @returns Request response and body.
 */
async function requestP(req: IRequest, options: IRequestOptions) {
	const r = await new Promise<{
		//
		/**
		 * Response object.
		 */
		response: IRequestResponse;

		/**
		 * Response body.
		 */
		body: Buffer | string;
	}>((resolve, reject) => {
		req(options, (error, response, body: Buffer | string) => {
			if (error) {
				reject(error);
				return;
			}
			resolve({
				response,
				body
			});
		});
	});
	return r;
}

/**
 * Create a VM sandbox safe from context leakage.
 *
 * @returns Methods to run code in the VM sandbox.
 */
function createSandbox() {
	// Create a context with which to run code in.
	// Creating the object with a null prototype is very important.
	// Prevents host variables from leaking into the sanbox.
	const ctxObj = Object.create(null) as {toString?: () => string};
	if (ctxObj.toString) {
		throw new Error('Failed to create object without prototype');
	}
	const ctx = vm.createContext(ctxObj);
	return {
		/**
		 * Run code, no return.
		 *
		 * @param code Code string.
		 * @param opts VM options.
		 */
		run: (code: string, opts: vm.RunningScriptOptions) => {
			let error = false;
			try {
				vm.runInContext(code, ctx, opts);
			} catch (err) {
				error = true;
			}
			if (error) {
				throw new Error('Error running sandboxed script');
			}
		},

		/**
		 * Run code, return data.
		 *
		 * @param data The data to get.
		 * @param opts VM options.
		 * @returns Data object.
		 */
		data: (data: {[k: string]: string}, opts: vm.RunningScriptOptions) => {
			const body = Object.entries(data)
				.map(a => `${JSON.stringify(a[0])}:${a[1]}`)
				.join(',');
			const script = `(""+JSON.stringify({${body}}))`;
			let r: {[k: string]: any} | null = null;
			try {
				// Force return value string with concatenation, NOT casting.
				// This prevents any funny business from sandboxed code.
				r = JSON.parse(
					// eslint-disable-next-line
					'' + vm.runInContext(script, ctx, opts)
				) as {[k: string]: any} | null;
			} catch (err) {
				// Do nothing.
			}
			if (!r) {
				throw new Error('Error running sandboxed script');
			}
			return r;
		}
	};
}

/**
 * Code to create window.
 *
 * @param body HTML body.
 * @returns JavaScript code.
 */
function codeWindow(body: string) {
	return `(${WINDOW})(this,${JSON.stringify(body)})`;
}

/**
 * Extract file info from a URL.
 *
 * @param uri The URI to extract info from.
 * @param req Optional custom request function or null.
 * @returns File info.
 */
export async function extract(uri: string, req: IRequest | null = null) {
	const requester = req || (request as IRequest);
	const {response, body} = await requestP(requester, {
		url: uri,
		gzip: true
	});
	const {statusCode} = response;
	if (statusCode !== 200) {
		throw new Error(`Invalid status code: ${statusCode}`);
	}
	const bodyType = typeof body;
	if (bodyType !== 'string') {
		throw new Error(`Invalid body type: ${bodyType}`);
	}

	const sandbox = createSandbox();
	const timeout = 1000;

	// Setup environment.
	sandbox.run(codeWindow(body.toString()), {});

	// Extract info from environment.
	const info = sandbox.data(
		{
			scripts:
				'(function(i,r,l){' +
				'while(++i<l.length){' +
				'r.push(l[i].textContent)' +
				'}' +
				'return r' +
				'})(-1,[],document.getElementsByTagName("script"))'
		},
		{
			timeout
		}
	);

	// Run the scripts that modify the download button.
	for (const script of info.scripts) {
		if ((script as string).includes('dlbutton')) {
			sandbox.run(script, {
				timeout
			});
		}
	}

	// Extract info about environment.
	const result = sandbox.data(
		{
			dlbutton: 'document.getElementById("dlbutton").href'
		},
		{
			timeout
		}
	);

	// Check result.
	if (!result.dlbutton) {
		throw new Error('Failed to extract info');
	}

	// Parse download link and file name.
	const u = new url.URL(result.dlbutton, uri);
	return {
		download: u.href,
		filename: decodeURI(u.pathname.split('/').pop() || '') || null
	};
}
