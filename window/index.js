'use strict';

var xmldom = require('@xmldom/xmldom');

var noop = function () {
	// Do nothing.
};

module.exports = function (window, body) {
	window.window = window;
	window.self = window;
	window.top = window;
	window.parent = window;

	var document = new xmldom.DOMParser({
		errorHandler: {
			warning: noop,
			error: noop,
			fatalError: noop
		}
	}).parseFromString(String(body), 'text/html');
	window.document = document;
};
