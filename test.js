var fs = require("fs"),
    dnsproxy = require(__dirname + "/proxy.js");

var args = process.argv,
    configFile, addresses;

if(args.length < 3){
    console.error(["Usage:", args[0], args[1], "[config file]"].join(" "));
    process.exit(-1);
}

configFile = args[2];
options = JSON.parse(fs.readFileSync(configFile));

dnsproxy.createServer({
    addresses: options.addresses || {},
    cache: options.hasOwnProperty("cache") ? !!options.cache : true
}).start(options.bind || "0.0.0.0");

// vim600: sw=4 ts=4 fdm=marker syn=javascript
