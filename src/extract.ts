import vm from 'vm';
import url from 'url';

import request from 'request';
import cheerio from 'cheerio';

/**
 * A request promise wrapper.
 *
 * @param req Request function.
 * @param options Request options.
 * @returns Request response and body.
 */
async function requestP(
	req: typeof request,
	options: request.OptionsWithUrl
) {
	const r = await new Promise<{

		/**
		 * Response object.
		 */
		response: request.Response;

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
	$('script').each((elI, el) => {
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
	req: typeof request | null = null
) {
	const requester = req || request;
	const {response, body} = await requestP(requester, {
		url: uri
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
