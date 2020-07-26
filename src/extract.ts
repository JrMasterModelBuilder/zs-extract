import vm from 'vm';
import url from 'url';

import cheerio from 'cheerio';
import fetch from 'node-fetch';

export interface IRequestOptions {

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

export type IRequest = (
	options: IRequestOptions,
	cb?: IRequestCallback
) => any;

/**
 * The default request implementation.
 *
 * @param options Options object.
 * @param cb Callback function.
 */
function request(
	options: IRequestOptions,
	cb: IRequestCallback
) {
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
	})()
		.then(
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
async function requestP(
	req: IRequest,
	options: IRequestOptions
) {
	const r = await new Promise<{

		/**
		 * Response object.
		 */
		response: IRequestResponse;

		/**
		 * Response body.
		 */
		body: any;
	}>((resolve, reject) => {
		req(options, (error, response, body) => {
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
 * Extract script code from HTML code.
 *
 * @param html HTML code.
 * @returns Script code.
 */
function extractScripts(html: string) {
	const r: string[] = [];
	const $ = cheerio.load(html);
	$('script').each((_elI, el) => {
		const data = $(el).html();
		if (data) {
			r.push(data);
		}
	});
	return r;
}

/**
 * Attempt to extract info from script.
 *
 * @param script Script code.
 * @returns Result object or null.
 */
function extractScript(script: string) {
	let result: object | null = null;
	if (!script.includes('dlbutton')) {
		return result;
	}

	// Create a context with wich to run code in
	// Creating the object with a null prototype is very important.
	// Prevents host variables from leaking into the sanbox.
	const ctx = vm.createContext(Object.create(null));
	const runOpts = {
		timeout: 1000
	};

	// Setup environment.
	const codePre = [
		/* eslint-disable @typescript-eslint/indent */
		'window = this;',
		'document = (function(r) {',
			'var elements = {',
				'"dlbutton": {},',
				'"fimage": {}',
			'};',
			'r.getElementById = function(id) {',
				'return elements[id];',
			'}',
			'return r;',
		'})({});'
		/* eslint-enable @typescript-eslint/indent */
	].join('\n');

	// Extract info from environment.
	const codePost = [
		/* eslint-disable @typescript-eslint/indent */
		'JSON.stringify({',
			'"dlbutton": document.getElementById("dlbutton").href',
		'})'
		/* eslint-enable @typescript-eslint/indent */
	].join('\n');

	// Attempt to run code in sanbox and extract the info.
	try {
		// Run the pre script.
		vm.runInContext(codePre, ctx, runOpts);

		// Run the script code.
		vm.runInContext(script, ctx, runOpts);

		// Run the post script.
		// Force return value to be string, with concatenation, NOT casting.
		// This prevents any funny business from sandboxed code.
		// eslint-disable-next-line
		result = JSON.parse('' + vm.runInContext(codePost, ctx, runOpts));
	}
	catch (err) {
		// Ignore failure.
	}
	return result;
}

/**
 * Extract file info from a URL.
 *
 * @param uri The URI to extract info from.
 * @param req Optional custom request function or null.
 * @returns File info.
 */
export async function extract(
	uri: string,
	req: IRequest | null = null
) {
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

	const scripts = extractScripts(body);
	let result: any | null = null;
	for (const script of scripts) {
		result = extractScript(script);
		if (result) {
			break;
		}
	}
	if (!result || !result.dlbutton) {
		throw new Error('Failed to extract info');
	}

	const download = url.resolve(uri, result.dlbutton);
	const filename = decodeURI(
		(url.parse(download).pathname || '').split('/').pop() || ''
	) || null;

	return {
		download,
		filename
	};
}
