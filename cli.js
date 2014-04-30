var fs = require("fs"),
    dnsproxy = require(__dirname + "/proxy.js");

var args = process.argv.slice(2),
    index, count, argv, parts, config, key, domain,
    options;

options = {
    addresses: {}
};

for (index = 0, count = args.length; index < count; index++) {
    argv = args[index];
    switch (argv.toLowerCase()) {
        case "-b": // -b 192.168.1.1
            if (argv = getNextArgv()) {
                options.bind = argv;
            } else {
                printUsage();
            }
            break;
        case "-p": // -p 53
            if (argv = getNextArgv()) {
                options.port = parseInt(argv);
            } else {
                printUsage();
            }
            break;
        case "-c": // -c true|false
            argv = getNextArgv();
            options.cache = argv === false || /^true|1$/i.test(argv) ? true : false;
            break;
        case "-a": // -a a.com:1.2.3.4 *.com:2.3.4.5 ...
            if (argv = getNextArgv()) {
                do {
                    parts = argv.split(":");
                    if (parts.length === 2) {
                        options.addresses[parts[0]] = parts[1];
                    }
                } while (argv = getNextArgv());
            } else {
                printUsage();
            }
            break;
        case "-f": // -f dnsproxy.json
            if (argv = getNextArgv()) {
                if (fs.existsSync(argv)) {
                    config = JSON.parse(fs.readFileSync(argv, "utf8"));
                    for (key in config) {
                        if (config.hasOwnProperty(key)) {
                            if (key === "addresses") {
                                for (domain in config.addresses) {
                                    options.addresses[domain] = config.addresses[domain];
                                }
                            } else {
                                options[key] = config[key];
                            }
                        }
                    }
                } else {
                    console.error("config file \"" + argv + "\" dose not exists.");
                    printUsage();
                }
            } else {
                printUsage();
            }
            break;
        case "-v":

            console.log("dnsproxy version: " + JSON.parse(fs.readFileSync(__dirname + "/package.json", "utf8"))["version"]);
            process.exit(0);
            break;
        case "-?":
        case "-h":
        case "--help":
        default:
            printUsage();
    }
}

function getNextArgv() {
    var i = index + 1,
        v;
    if (i < count) {
        v = args[i];

        if (v.indexOf("-") === 0) {
            return false;
        }

        index++;
        return v;
    }
    return false;
}

function printUsage() {
    console.error([
        "Usage: dnsproxy [-?hv] [-b address] [-p port] [-c true|false] [-a domain1:ip1 [domain2:ip2 [...]]] [-f filename]",
        "",
        "Options:",
        "  -?,-h         : this help",
        "  -v            : show version and exit",
        "  -b address    : set bind address",
        "  -p port       : set bind port(default: 53)",
        "  -c true|false : enable/disable cache",
        "  -a domain:ip  : add one or more DNS recode",
        "  -f filename   : load options from file"
    ].join("\n"));
    process.exit(-1);
}

dnsproxy.createServer(options).start();
// vim600: sw=4 ts=4 fdm=marker syn=javascript
