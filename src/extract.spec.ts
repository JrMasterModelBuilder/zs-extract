import crypto from 'crypto';

import fetch from 'node-fetch';

import {extract} from './extract';

const timeout = 10000;

const avatar = {
	URL: 'https://www85.zippyshare.com/v/eE67Qy6f/file.html',
	filename: 'jmmb avatar.png',
	size: 136877,
	sha256: '3602a46469e9ece1ec77f3c6ea484b2ef90c09a2a6f4214456c461ece0d4f7f7'
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

describe('extract', () => {
	describe('extract', () => {
		it(
			'simple',
			async () => {
				const info = await extract(avatar.URL);
				expect(info.filename).toBe(avatar.filename);
				expect(info.download).toMatch(/^https?:\/\//i);

				if (skipTestDL) {
					// Optionally force download request, without test.
					// Might help keep the download active.
					if (forceRequestDl) {
						const res = await fetch(info.download, {
							headers: {
								'User-Agent': '-'
							}
						});
						await res.buffer();
					}
					return;
				}

				const res = await fetch(info.download, {
					headers: {
						'User-Agent': '-'
					}
				});
				const body = await res.buffer();

				expect(res.status).toBe(200);

				expect(body.length).toBe(avatar.size);

				expect(sha256(body)).toBe(avatar.sha256);
			},
			timeout
		);
	});
});
