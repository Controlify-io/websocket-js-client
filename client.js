const WebSocket = require('ws');
const ControlifyClient = require('./controlifyClient');
const fs = require('fs');

const argvOpts = {
	boolean: ['debug', 'help'],
	alias: {
		config: ['c', 'config'],
		serverUrl: ['u', 'serverurl'],
		apiKey: ['k', 'apikey'],
		unitId: ['i', 'unitid'],
		unitSpec: ['s', 'unitspec'],
		debug: ['d', 'debug'],
		help: ['h', 'help'],
	}
};
const argv = require('minimist')(process.argv.slice(2), argvOpts);

if(argv.help) {
	showHelp();
	process.exit(0);
}


///////////////////
// Load config file
///////////////////
let configFile = './controlifyClient.json';
if(typeof argv.config === 'string') { configFile = argv.config; }

let fileConfig = {};
try {
	fileConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
}
catch (err) { console.log('Failed to read config from ' + configFile); }

////////////////////
// Connect websocket
////////////////////
let serverUrl = 'ws://controlify.io/server';
if(typeof argv.serverUrl === 'string') { serverUrl = argv.serverUrl; }
else if(typeof fileConfig.serverurl === 'string') { serverUrl = fileConfig.serverurl; }
const ws = new WebSocket(serverUrl);

/////////////////////
// Get client options
/////////////////////
const getUnitId = () => 'unitId'; // Generate from mac address etc?
const getUnitSpec = () => 'unitSpec'; // Probe for umber of io pins etc

let clientOptions = {
	apiKey: '',
	unitId: getUnitId(),
	unitSpec: getUnitSpec(),
	handlers: {},
	debug: false,
};

for(let opt in clientOptions) {
	if(typeof argv[opt] !== 'undefined') { clientOptions[opt] = argv[opt]; }
	else if(typeof fileConfig[opt.toLowerCase()] !== 'undefined') { clientOptions[opt] = fileConfig[opt.toLowerCase()]; }
}

///////////////
// Start client
///////////////
const client = new ControlifyClient(ws, clientOptions);

const checkExit = () => { if(client.exitCode !== null) { process.exit(client.exitCode); } };
setInterval(checkExit, 1000);

//==============================================

const showHelp = () => {
	console.log(
		'Arguments: \n' +
		'  -c\n' +
		'  --config : file containing a json config object (defaults to ./controlifyClient.js)\n' +
		'  -u\n' +
		'  --serverurl : url of the controlify server\n' +
		'  -k\n' +
		'  --apikey : api key to pass to the server\n' +
		'  -i\n' +
		'  --unitid : the id of this unit\n' +
		'  -s\n' +
		'  --unitspec : json string specifying the spec of this unit\n' +
		'  -d\n' +
		'  --debug : turn on extra debug output\n' +
		'  -h\n' +
		'  --help : show this message\n'
	);
};

