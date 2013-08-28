var proxy = require("./proxy.js");

proxy.createServer({
    addresses: {
        "www.baidu.com": "127.0.0.1",
        "a.cn": "localhost",
        "b.cn": "proxyhost"
    },
    cache: true
}).start();
