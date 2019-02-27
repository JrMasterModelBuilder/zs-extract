import request from 'request';
import crypto from 'crypto';

import {
	extract
} from './extract';

/**
 * A request promise wrapper.
 *
 * @param options Request options.
 * @return Request response and body.
 */
async function requestP(options: request.OptionsWithUrl) {
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
		request(options, (error, response, body) => {
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
 * Create a sha256 hex lowercase hash from buffer.
 *
 * @param buffer The buffer to hash.
 * @return Hex string.
 */
function sha256(buffer: Buffer) {
	const h = crypto.createHash('sha256');
	h.update(buffer);
	return h.digest('hex').toLowerCase();
}

const avatar = {
	URL: 'https://www109.zippyshare.com/v/EXfrFTJo/file.html',
	filename: 'jmmb avatar.png',
	size: 136877,
	sha256: '3602a46469e9ece1ec77f3c6ea484b2ef90c09a2a6f4214456c461ece0d4f7f7'
};

describe('extract', () => {
	describe('extract', () => {
		it('simple', async () => {
			const info = await extract(avatar.URL);
			expect(info.filename).toBe(avatar.filename);

			const data = await requestP({
				url: info.download,
				encoding: null
			});
			expect(data.body.length).toBe(avatar.size);

			expect(sha256(data.body)).toBe(avatar.sha256);
		});

		it('custom request object', async () => {
			const req = request.defaults({});
			const info = await extract(avatar.URL, req);
			expect(info.filename).toBe(avatar.filename);

			const data = await requestP({
				url: info.download,
				encoding: null
			});
			expect(data.body.length).toBe(avatar.size);

			expect(sha256(data.body)).toBe(avatar.sha256);
		});
	});
});
