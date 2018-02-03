const { execSync } = require('child_process');

module.exports = class ControlifyClient {
	constructor(ws, options) {
		this.ws = ws;
		this.clientVersion = '0.0.1';
		this.exitCode = null;
		this.handshakeDone = false;
		this.handshakeStage = 0;

		this.handlers = {
			pin: 'pin',
		};

		let optionErrors = [];

		if(typeof options.apiKey !== 'string' || options.apiKey === '') { optionErrors.push('Missing api key'); }
		else { this.apiKey = options.apiKey; }

		if(typeof options.unitId !== 'string' || options.unitId === '') { optionErrors.push('Missing unit identifier'); }
		else { this.unitId = options.unitId; }

		// String - should be a json encoding of a unit spec object
		if(typeof options.unitSpec !== 'string' || options.unitSpec === '') { optionErrors.push('Missing unit spec'); }
		else { this.unitSpec = options.unitSpec; }

		if(typeof options.handlers === 'object') {
			for(let handler in options.handlers) {
				this.handlers[handler] = options.handlers[handler];
			}
		}

		this.debug = Boolean(options.debug);

		if(optionErrors.length) {
			this.exit('Initiallisation errors --\n  ' + optionErrors.join('\n  '), 1);
			return;
		}

		this.ws.on('message', this.processMessage);
	}

	processMessage(message) {
		if(this.handshakeDone) {
			console.log(message);
			message.split("\n").forEach((cmd) => {
				let cmdParts = cmd.split(' ');
				if(cmdParts[0] === 'pause') {
					// do a pause
				}
				else if(typeof this.handlers[cmdParts[0]] === 'string') {
					try {
						execSync(this.handlers[cmdParts[0]] + ' ' + cmdParts.slice(1).join(' '));
					}
					catch (err) {
						console.log(`Handler error [${cmdParts[0]}]: ${err.message}`);
					}
				}
				else { console.log(`Error: no handler for ${cmdParts[0]}`); }
			});
		}
		else {
			this.handshake(message);
			return;
		}
	}

	handshake(message) {
		switch(this.handshakeStage) {
			case 0:
				if(message.substr(0, 20) !== 'controlify.io server') {
					this.exit('Unrecognised handshake from server', 1);
					return;
				}
				// The last part of the server message should be a semver number -- check this and exit if we can't talk to this version
				this.ws.send(
					'controlify.io client ' +
					this.clientVersion + ' ' +
					this.apiKey + ' ' +
					this.unitSpec
				);
				this.handshakeStage = 1;
				break;
			case 1:
				if(message == 'ok') { /* all good, do nothing */ }
				else if(message.substr(0, 11) === 'deprecated ') { console.log(`Warning: ${message}`); }
				else if(message.substr(0, 12) === 'unsupported ') { this.exit(`Error: ${message}`); }
				else {
					this.exit('Unrecognised handshake response form server', 1);
					return;
				}
				this.ws.send('ok');
				this.handshakeDone = true;
				this.handshakeStage = 2;
				break;
			default:
				this.exit('Call to handshake() after handshake finished', 1);
				return;
		}
	}

	close() {
		this.exit('Client exiting normally', 0);
	}

	exit(message, code) {
		this.ws.close();
		console.log(message);
		this.exitCode = code;

		if(code) { throw new Error(`Error ${code}: ${message}`); }
	}
};
