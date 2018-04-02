"use strict";
//const cp = require('child_process');
//const execSync = cp.execSync;

const MAX_LOCK_TRY = 20;
const LOCK_WAIT = 500;

module.exports = class ControlifyClient {
	constructor(ws, options) {
		this.ws = ws;
		this.clientVersion = '0.0.1';
		this.exitCode = null;
		this.handshakeDone = false;
		this.handshakeStage = 0;

		this.pinLocks = [];

		this.handlers = {
			pin: 'pi-pin',
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
			this.exit(`Initiallisation errors --\n  ${optionErrors.join('\n  ')}`, 1);
			return;
		}

		this.ws.on('message', this.processMessage.bind(this));
		this.ws.on('close', this.close.bind(this));
		if(this.debug) {
			console.log(`Message handler set. WS ready state ${this.ws.readyState}`);
			this.ws.on('open', this.showDebug('Socket open'));
			this.ws.on('ping', this.showDebug('Socket ping'));
		}
	}

	processMessage(message) {
		if(this.handshakeDone) {
			let commandQueue = Promise.resolve();
			let lockPins = [];
			if(this.debug) { console.log(`Received: ${message.replace('\n', '\\n')}`); }

			let cmds = message.split('\n');
			let pinReg = /^pin (\d+)/;

			cmds.forEach((cmd) => {
				let pinMatches = cmd.match(pinReg);
				if(pinMatches) { lockPins[parseInt(pinMatches[1])] = true; }
			});
			lockPins = Object.keys(lockPins);

			if(lockPins.length) {
				lockPins.reverse().forEach((lock) => { cmds.unshift(`lock ${lock}`); });
				cmds.push(`unlock ${lockPins.join(',')}`);
			}

			cmds.forEach((cmd) => {
				if(this.debug) { console.log(`Queueing: ${cmd}`); }
				commandQueue = commandQueue.then(() => { return this.processCommand(cmd); });
			});
		}
		else {
			this.handshake(message);
		}
	}

	processCommand(cmd) {
		if(this.debug) { console.log(`Processing command: ${cmd}`); }
		let cmdParts = cmd.split(' ');
		if(cmdParts[0] === 'lock') {
			let pin = parseInt(cmdParts[1], 10);
			if(!isNaN(pin)) {
				return new Promise((resolve, reject) => {
					this.tryLock(pin, MAX_LOCK_TRY, resolve, reject);
				});
			}
			else {
				console.log(`Error: invalid value for pin lock - ${cmdParts[1]}`);
			}
		}
		else if(cmdParts[0] === 'pause') {
			let ms = parseInt(cmdParts[1], 10);
			if(!isNaN(ms)) {
				if(this.debug) { console.log(`Pausing for ${ms} ms`); }
				return new Promise((resolve, _reject) => {
					setTimeout(() => {
						if(this.debug) { console.log('Done a pause'); }
						resolve();
					}, ms);
				});
			}
			else {
				console.log(`Error: invalid value for pause - ${cmdParts[1]}`);
			}
		}
		else if(typeof this.handlers[cmdParts[0]] === 'string') {
			try {
				console.log('Would do: ' + this.handlers[cmdParts[0]] + ' ' + cmdParts.slice(1).join(' '));
				//execSync(this.handlers[cmdParts[0]] + ' ' + cmdParts.slice(1).join(' '));
			}
			catch (err) {
				console.log(`Handler error [${cmdParts[0]}]: ${err.message}`);
			}
		}
		else if(cmdParts[0] === 'unlock') {
			this.unlock(cmdParts[1]);
		}
		else {
			console.log(`Error: no handler for ${cmdParts[0]}`);
		}
	}

	handshake(message) {
		if(this.debug) {
			console.log(`Handshake stage ${this.handshakeStage}`);
			console.log(`Got: ${message}`);
		}

		switch(this.handshakeStage) {
			case 0:
				if(message.substr(0, 20) !== 'controlify.io server') {
					this.exit('Unrecognised handshake from server', 1);
					return;
				}
				// The last part of the server message should be a semver number
				// check this and exit if we can't talk to this version
				this.ws.send(
					'controlify.io client ' +
					this.clientVersion + ' ' +
					this.apiKey + ' ' +
					this.unitSpec
				);
				this.handshakeStage = 1;
				break;
			case 1:
				if(message == 'ok') { if(this.debug) { console.log('ok handshake response'); } }
				else if(message.substr(0, 11) === 'deprecated ') { console.log(`Warning: ${message}`); }
				else if(message.substr(0, 12) === 'unsupported ') {
					this.exit(`Error: ${message}`, 1);
					return;
				}
				else {
					this.exit('Unrecognised handshake response from server', 1);
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

	tryLock(pin, triesLeft, resolve, reject) {
		if(this.debug) { console.log(`Trying to get lock for pin ${pin} (${triesLeft} tries left)`); }

		if(!triesLeft) {
			if(this.debug) { console.log(`Failed to get lock for pin ${pin}`); }
			reject();
		}
		else if(!this.pinLocks[pin]) {
			this.pinLocks[pin] = true;
			if(this.debug) { console.log(`Got lock for  pin ${pin}`); }
			resolve();
		}
		else { setTimeout(() => { this.tryLock(pin, triesLeft - 1, resolve, reject); }, LOCK_WAIT); }
	}

	unlock(pins) {
		pins.split(',').forEach((pin) => { this.pinLocks[pin] = false; });
	}

	close(num, reason) {
		let exitMsg = `Websocket closed [${num}]`;
		if(reason) { exitMsg += ` - ${reason}`; }
		this.exit(exitMsg, 0);
	}

	exit(message, code) {
		try { this.ws.close(); } catch(err) { /* Do nothing */ }
		this.exitCode = code;

		if(code) { throw new Error(`${code} - ${message}`); }
		else { console.log(message); }
	}

	showDebug(message) {
		return function () { console.log(message); };
	}
};
