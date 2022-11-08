import crypto from 'crypto';

import fetch from 'node-fetch';

import {extract} from './extract';

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

const retries = 5;

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

/**
 * Retry a promise function.
 *
 * @param f Promise function.
 * @returns The first successful response.
 */
async function retry<T>(f: () => Promise<T>): Promise<T> {
	let r: T;
	let error: Error | null = null;
	for (let i = 0; ; i++) {
		try {
			// eslint-disable-next-line no-await-in-loop
			r = await f();
			break;
		} catch (err) {
			error = error || (err as Error);
		}
		if (i < retries) {
			// eslint-disable-next-line no-await-in-loop
			await new Promise(resolve => setTimeout(resolve, i * 1000));
			continue;
		}
		throw error;
	}
	return r;
}

describe('extract', () => {
	describe('extract', () => {
		it(
			'simple',
			async () => {
				const info = await retry(async () => extract(avatar.URL));

				expect(info.filename).toBe(avatar.filename);
				expect(info.download).toMatch(/^https?:\/\//i);

				if (skipTestDL) {
					// Optionally force download request, without test.
					// Might help keep the download active.
					if (forceRequestDl) {
						await retry(async () => {
							const res = await fetch(info.download, {
								headers: {
									'User-Agent': '-'
								}
							});
							await res.buffer();
						});
					}
					return;
				}

				const body = await retry(async () => {
					const res = await fetch(info.download, {
						headers: {
							'User-Agent': '-'
						}
					});
					if (res.status !== 200) {
						throw new Error(`Status code: ${res.status}`);
					}
					const body = await res.buffer();
					return body;
				});

				expect(body.length).toBe(avatar.size);
				expect(sha256(body)).toBe(avatar.sha256);
			},
			timeout
		);
	});
});
