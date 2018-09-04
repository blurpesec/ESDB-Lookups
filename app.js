const http = require('http');
const request = require('request');
const config = require('./config');
const debug = require('debug')('app');
const fs = require('fs');
const yaml = require('js-yaml');
const createWebhook = require('github-webhook-handler');
const createGitHubApp = require('github-app');

const webhook = createWebhook({
	path: '/',
	secret: config.webhookSecret
});

const app = createGitHubApp({
	id: config.githubAppID,
	cert: fs.readFileSync('private-key.pem')
});

const server = http.createServer((req, res) => {
	webhook(req, res, err => {
		if (err) {
			console.error(err);
			res.statusCode = 500;
			res.end('500');
		} else {
			res.statusCode = 404;
			res.end('404');
		}
	});
});

const urlScanReport = (url) => {
	return new Promise((resolve,reject) => {
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
				reject(err);
			} else if(response.statusCode != 200) {
				reject("URLScan returned a " + response.statusCode + " status");
			} else {
				resolve(body.result);
			}
		});
	});
}

webhook.on('pull_request', async event => {
	if (event.payload.action === 'opened') {
		const github = await app.asInstallation(event.payload.installation.id);
		debug("Getting original branch...");
		const originalBranch = await github.repos.getContent({
			owner: event.payload.repository.owner.login,
			repo: event.payload.repository.name,
			ref: event.payload.pull_request.base.ref,
			path: '_data/scams.yaml'
		});
		debug("Getting PR branch...");
		const pullRequestBranch = await github.repos.getContent({
			owner: event.payload.repository.owner.login,
			repo: event.payload.repository.name,
			ref: event.payload.pull_request.head.ref,
			path: '_data/scams.yaml'
		});
		const originalContent = yaml.safeLoad(Buffer.from(originalBranch.data.content,'base64').toString());
		const pullRequestContent = yaml.safeLoad(Buffer.from(pullRequestBranch.data.content,'base64').toString());
		const oldEntries = originalContent.map(entry => entry.url);
		const newEntries = await Promise.all(pullRequestContent.map(entry => entry.url).filter(entry => !oldEntries.includes(entry)).map(url => pullRequestContent.find(entry => entry.url === url)).map(async entry => {
			entry.URLScan = (await urlScanReport(entry.url)) || '(Error)';
			return entry;
		}));
		debug("Found " + newEntries.length + " new entries");
		if(newEntries.length > 0) {
			debug("Creating comment...");
			await github.issues.createComment({
				owner: event.payload.repository.owner.login,
				repo: event.payload.repository.name,
				number: event.payload.pull_request.number,
				body: '**New entries added**: \n\n' + newEntries.map(entry => Object.keys(entry).map(key => '**' + key + '**: ' + entry[key]).join('\n')).join("\n<hr>\n")
			});
		} else {
			debug("Creating comment...");
			await github.issues.createComment({
				owner: event.payload.repository.owner.login,
				repo: event.payload.repository.name,
				number: event.payload.pull_request.number,
				body: '**No new entries added**'
			});
		}
	}
});

server.listen(config.port);