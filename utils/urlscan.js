const debug = require('debug')('urlscan');
const request = require('request');
const config = require('./config');

module.exports = (url) => {
	return new Promise((resolve,reject) => {
		debug("Reporting " + url + "...");
		request.post({
			url: 'https://urlscan.io/api/v1/scan/',
			json: true,
			headers: {
				'API-Key': config.urlScanAPIKey
			},
			body: {
				'url': url,
				'public': 'on'
			}
		}, (err, response, body) => {
			if(err) {
				debug("Failed! " + err);
				reject(err);
			} else if(response.statusCode != 200) {
				debug("Failed! Invalid statusCode " + response.statusCode);
				reject("Invalid statusCode");
			} else if(!body) {
				debug("Failed! Empty body");
				reject("Empty body");
			} else if(!body.result) {
				debug("Failed! No result returned");
				reject("No result returned");
			} else {
				debug("Success! " + body.result);
				resolve(body.result);
			}
		});
	});
}