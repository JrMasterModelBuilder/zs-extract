import crypto from 'crypto';

import fetch from 'node-fetch';

import {
	extract,
	IRequest,
	IRequestCallback,
	IRequestOptions,
	IRequestResponse
} from './extract';

const timeout = 60000;

const avatar = {
	URL: 'https://www83.zippyshare.com/v/yakMuCxe/file.html',
	filename: 'jmmb avatar.png',
	size: 13266,
	sha256: '4ebfcfd969c5f28904983cfd4f82a55a946ef2fa77eb74fc6be4d4311e6bf8ed'
};

// eslint-disable-next-line no-process-env
const skipTestDL = /^(1|true|yes)$/i.test(process.env.SKIP_TEST_DL || '');

const forceRequestDl = /^(1|true|yes)$/i.test(
	// eslint-disable-next-line no-process-env
	process.env.FORCE_REQUEST_DL || ''
);

/**
 * Create a sha256 hex lowercase hash from buffer.
 *
 * @param buffer The buffer to hash.
 * @returns Hex string.
 */
function sha256(buffer: Buffer) {
	const h = crypto.createHash('sha256');
	h.update(buffer);
	return h.digest('hex').toLowerCase();
}

async function corsAnywhereFetch(
	url: string,
	options: {
		method?: string;
		headers?: {[header: string]: string};
		compress?: boolean;
	}
) {
	const api = 'https://cors-anywhere.herokuapp.com';
	const demoUrl = `${api}/corsdemo`;
	const demo = await fetch(demoUrl);
	if (demo.status !== 403) {
		throw new Error(`Status code: ${demo.status}`);
	}
	const html = await demo.text();
	const inputM = html.match(/<input[^<>]*?accessRequest[^<>]*>/);
	const valueM = inputM ? inputM[0].match(/value=["'](.*?)["']/) : null;
	const value = valueM ? valueM[1] : null;
	if (!value) {
		throw new Error('Failed to get token');
	}

	const access = await fetch(
		`${demoUrl}?accessRequest=${encodeURIComponent(value)}`
	);
	if (access.status !== 403) {
		throw new Error(`Status code: ${access.status}`);
	}

	return fetch(`${api}/${url}`, {
		...options,
		headers: {
			'X-Requested-With': 'XMLHttpRequest',
			...options.headers
		}
	});
}

function fetchToRequest(
	fetch: (
		url: string,
		options: {
			method?: string;
			headers?: {[header: string]: string};
			compress?: boolean;
		}
	) => Promise<{
		status: number;
		headers: {
			raw(): {[header: string]: string[]};
		};
		buffer: () => Promise<Buffer>;
	}>
): IRequest {
	return (options: IRequestOptions, cb?: IRequestCallback) => {
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
			return encoding === null
				? data
				: data.toString(encoding as BufferEncoding);
		})().then(
			data => {
				if (cb) {
					cb(null, response, data);
					return;
				}
			},
			err => {
				if (cb) {
					cb(err, response, null);
					return;
				}
			}
		);
	};
}

async function zsExtract(uri: string) {
	let error: Error | null = null;

	// Try direct, then proxies.
	for (const f of [
		// Default fetch.
		null,
		// CORS anywhere proxy fetch.
		corsAnywhereFetch
	]) {
		const request = f ? fetchToRequest(f) : null;
		const fetcher = f || fetch;

		// Continue with the first fetch type that works.
		let info;
		try {
			// eslint-disable-next-line no-await-in-loop
			info = await extract(uri, request);
		} catch (err) {
			// Keep the first error.
			error = error || (err as Error);
		}
		if (!info) {
			continue;
		}

		// Download body may be included here.
		let body = null;
		if (skipTestDL) {
			// Optionally force download request, without test.
			// Might help keep the download active.
			if (forceRequestDl) {
				// eslint-disable-next-line no-await-in-loop
				const res = await fetcher(info.download, {
					headers: {
						'User-Agent': '-'
					}
				});
				// eslint-disable-next-line no-await-in-loop
				await res.buffer();
			}
		} else {
			// eslint-disable-next-line no-await-in-loop
			const res = await fetcher(info.download, {
				headers: {
					'User-Agent': '-'
				}
			});
			if (res.status !== 200) {
				throw new Error(`Status code: ${res.status}`);
			}
			// eslint-disable-next-line no-await-in-loop
			body = await res.buffer();
		}

		return {...info, body};
	}

	throw error || new Error('Unknown error');
}

describe('extract', () => {
	describe('extract', () => {
		it(
			'simple',
			async () => {
				const {filename, download, body} = await zsExtract(avatar.URL);

				expect(filename).toBe(avatar.filename);
				expect(download).toMatch(/^https?:\/\//i);

				if (body) {
					expect(body.length).toBe(avatar.size);
					expect(sha256(body)).toBe(avatar.sha256);
				}
			},
			timeout
		);
	});
});
