'use strict';
var dgram = require("dgram"),
    dns = require("dns"),
    util = require("util");

var DNS_DEFAULT_TTL = 0,
    DNS_BUFFER_SIZE = 1024,
    DNS_SERVER_PORT = 53,
    DNS_NAME_ENCODING = "ascii",
    DNS_POINTER_FLAG = 0xC0,
    DNS_MESSAGE_OFFSET_ID = 0,
    DNS_MESSAGE_OFFSET_FLAGS = 2,
    DNS_MESSAGE_OFFSET_QDCOUNT = 4,
    DNS_MESSAGE_OFFSET_ANCOUNT = 6,
    DNS_MESSAGE_OFFSET_NSCOUNT = 8,
    DNS_MESSAGE_OFFSET_ARCOUNT = 10,
    DNS_MESSAGE_OFFSET_PAYLOAD = 12,
    DNS_MESSAGE_FLAG_QR = 0x01 << 15,
    DNS_MESSAGE_FLAG_OPCODE = 0x0F << 11,
    DNS_MESSAGE_FLAG_AA = 0x01 << 10,
    DNS_MESSAGE_FLAG_TC = 0x01 << 9,
    DNS_MESSAGE_FLAG_RD = 0x01 << 8,
    DNS_MESSAGE_FLAG_RA = 0x01 << 7,
    DNS_MESSAGE_FLAG_RCODE = 0x0F << 0,
    DNS_MESSAGE_TYPE_A = 0x0001,
    DNS_MESSAGE_CLASS_IN = 0x0001;

function debug() { // {{{
    return console.log.apply(console, toArray(arguments));
}

function toArray(list) {
    return [].slice.call(list, 0);
} // }}}

function Message(buf) { // {{{
    if (Buffer.isBuffer(buf)) {
        this.parseFromBuffer(buf);
    } else {
        this.id = 0;
        this.flags = 0;
        this.queries = [];
        this.answers = [];
        this.authoritativeNameservers = [];
        this.additionalRecords = [];
    }
} // }}}

function readDomainName(buf, offset) { //{{{
    var length, ret = [],
        next = false;

    while ((length = buf.readUInt8(offset++)) > 0) {
        if ((length & DNS_POINTER_FLAG) == DNS_POINTER_FLAG) {
            if (next === false) {
                next = offset + 1;
            }
            offset = ((length & (~DNS_POINTER_FLAG)) << 8) | buf.readUInt8(offset);
            continue;
        }
        ret.push(buf.toString(DNS_NAME_ENCODING, offset, offset + length));
        offset += length;
    }
    //debug("------", ret.join("."), "-----");
    return {
        name: ret.join("."),
        next: (next === false ? offset : next)
    };
} // }}}

function readQueryPackage(buf, offset) { //{{{
    var name, type, klass,
        info;

    info = readDomainName(buf, offset);
    name = info.name;
    offset = info.next;

    type = buf.readUInt16BE(offset);
    offset += 2;

    klass = buf.readUInt16BE(offset);
    offset += 2;

    return {
        data: {
            name: name,
            type: type,
            klass: klass
        },
        next: offset
    };
} // }}}

function readAnswerPackage(buf, offset) { //{{{
    var ttl, len, rdata,
        info, data;
    info = readQueryPackage(buf, offset);
    data = info.data;
    offset = info.next;

    ttl = buf.readUInt32BE(offset);
    offset += 4;

    len = buf.readUInt16BE(offset);
    offset += 2;

    rdata = buf.toString('base64', offset, offset + len);
    offset += len;

    return {
        data: {
            name: data.name,
            type: data.type,
            klass: data.klass,
            ttl: ttl,
            rdata: rdata
        },
        next: offset
    };
} // }}}

function readPackages(buf, offset, count, callback) { // {{{
    //debug("readPackages(<buffer>, " + '0x' + offset.toString(16) + ", " + count + ", <callback>)");
    var data = [],
        info;
    while (count--) {
        //debug("callback(<buffer>, " + '0x' + offset.toString(16) + ")");
        info = callback(buf, offset);
        offset = info.next;
        data.push(info.data);
    }
    return {
        data: data,
        next: offset
    };
} // }}}

Message.prototype.parseFromBuffer = function(buf) { // {{{
    var qdCount, anCount, nsCount, arCount,
        offset, info,
        qName, qType, qClass;

    this.id = buf.readUInt16BE(DNS_MESSAGE_OFFSET_ID);
    this.flags = buf.readUInt16BE(DNS_MESSAGE_OFFSET_FLAGS);

    qdCount = buf.readUInt16BE(DNS_MESSAGE_OFFSET_QDCOUNT);
    anCount = buf.readUInt16BE(DNS_MESSAGE_OFFSET_ANCOUNT);
    nsCount = buf.readUInt16BE(DNS_MESSAGE_OFFSET_NSCOUNT);
    arCount = buf.readUInt16BE(DNS_MESSAGE_OFFSET_ARCOUNT);
    offset = DNS_MESSAGE_OFFSET_PAYLOAD;

    info = readPackages(buf, offset, qdCount, readQueryPackage);
    offset = info.next;
    this.queries = info.data;

    info = readPackages(buf, offset, anCount, readAnswerPackage);
    offset = info.next;
    this.answers = info.data;

    info = readPackages(buf, offset, nsCount, readAnswerPackage);
    offset = info.next;
    this.authoritativeNameservers = info.data;

    info = readPackages(buf, offset, arCount, readAnswerPackage);
    offset = info.next;
    this.additionalRecords = info.data;
}; // }}}

var domainMap;

function writeDomainName(buf, name, offset) { //{{{
    var items, length, index, item, len;
    if (domainMap.hasOwnProperty(name)) {
        index = domainMap[name];
        buf.writeUInt8(DNS_POINTER_FLAG | ((index >> 8) & (~DNS_POINTER_FLAG)), offset);
        offset += 1;

        buf.writeUInt8(index & 0xFF, offset);
        offset += 1;
    } else {
        domainMap[name] = offset;
        items = name.split(".");
        length = items.length;
        for (index = 0; index < length; index++) {
            item = items[index];

            offset += 1;
            len = buf.write(item, offset, DNS_NAME_ENCODING);
            buf.writeUInt8(len, offset - 1);
            offset += len;
        }
        buf.writeUInt8(0, offset);
        offset++;
    }
    return offset;
} // }}}

function writeQueryPackage(buf, pkg, offset) { // {{{
    offset = writeDomainName(buf, pkg.name, offset);

    buf.writeUInt16BE(pkg.type, offset);
    offset += 2;

    buf.writeUInt16BE(pkg.klass, offset);
    offset += 2;

    return offset;
} // }}}

function writeAnswerPackage(buf, pkg, offset) { // {{{
    var length;
    offset = writeQueryPackage(buf, pkg, offset);

    buf.writeUInt32BE(pkg.ttl, offset);
    offset += 4;

    offset += 2;
    length = buf.write(pkg.rdata, offset, "base64");
    buf.writeUInt16BE(length, offset - 2);
    offset += length;

    return offset;
} // }}}

function writePackages(buf, packages, offset, callback) { //{{{
    var length = packages.length,
        index, pkg;
    for (index = 0; index < length; index++) {
        pkg = packages[index];
        offset = callback(buf, pkg, offset);
    }
    return offset;
} // }}}

Message.prototype.fillBuffer = function(buf) { // {{{
    var offset,
        qdCount, anCount, nsCount, arCount;

    qdCount = this.queries.length;
    anCount = this.answers.length;
    nsCount = this.authoritativeNameservers.length;
    arCount = this.additionalRecords.length;

    buf.writeUInt16BE(this.id, DNS_MESSAGE_OFFSET_ID);
    buf.writeUInt16BE(this.flags, DNS_MESSAGE_OFFSET_FLAGS);

    buf.writeUInt16BE(qdCount, DNS_MESSAGE_OFFSET_QDCOUNT);
    buf.writeUInt16BE(anCount, DNS_MESSAGE_OFFSET_ANCOUNT);
    buf.writeUInt16BE(nsCount, DNS_MESSAGE_OFFSET_NSCOUNT);
    buf.writeUInt16BE(arCount, DNS_MESSAGE_OFFSET_ARCOUNT);

    offset = DNS_MESSAGE_OFFSET_PAYLOAD;
    domainMap = {};

    offset = writePackages(buf, this.queries, offset, writeQueryPackage);
    offset = writePackages(buf, this.answers, offset, writeAnswerPackage);
    offset = writePackages(buf, this.authoritativeNameservers, offset, writeAnswerPackage);
    offset = writePackages(buf, this.additionalRecords, offset, writeAnswerPackage);

    return offset;
}; // }}}

Message.prototype.testFlags = function(mask) { // {{{
    return (this.flags & mask) == mask;
}; // }}}

Message.prototype.isAnswer = function() { // {{{
    return this.testFlags(DNS_MESSAGE_FLAG_QR);
}; // }}}

Message.prototype.opcode = function() { // {{{
    return (this.flags & DNS_MESSAGE_FLAG_OPCODE) >> 11;
}; // }}}

var responseBuffer = null;

function Server(options) { // {{{
    if (!(this instanceof Server)) return new Server(options);

    this.addresses = (options && options.addresses) || {};
    this.cache = !! options.cache;

    dgram.Socket.call(this, "udp4", serverMessageHandler);
}
util.inherits(Server, dgram.Socket);

Server.prototype.start = function(address, callback) {
    responseBuffer = responseBuffer || new Buffer(DNS_BUFFER_SIZE);
    this.bind(DNS_SERVER_PORT, address, callback);
}; // }}}

function encodeAddress(address) { // {{{
    var i;
    address = address.split(".");
    if (address.length < 4) return false;

    for (i = 0; i < 4; i++) {
        responseBuffer[i] = parseInt(address[i]);
    }
    return responseBuffer.toString("base64", 0, 4);
} // }}}

function serverMessageHandler(buf, rinfo) { // {{{
    var self = this,
        msg = new Message(buf),
        queries, length, index, item, domains, domain,
        addresses, address, answers, info;

    if (msg.isAnswer() || msg.opcode() != 0) return; // 非标准查询请求

    queries = msg.queries;
    length = queries.length;
    domains = [];

    for (index = 0; index < length; index++) {
        item = queries[index];
        if (item.type != DNS_MESSAGE_TYPE_A || item.klass != DNS_MESSAGE_CLASS_IN) return; //非A记录查询
        domains.push(item.name);
    }

    info = this.address();
    addresses = this.addresses;
    answers = [];
    length = index = domains.length;
    while (index--) {
        domain = domains[index];
        if (addresses.hasOwnProperty(domain)) { //尝试直接回复
            address = addresses[domain];
            address = (address == "localhost" ? rinfo.address : (address == "proxyhost" ? info.address : address));
            if (pushAnswer(domain, address)) {
                onresolve();
                continue;
            }
        }
        resolve(domain);
    }

    function pushAnswer(domain, address) {
        var rdata = encodeAddress(address);
        if (rdata) {
            answers.push({
                name: domain,
                type: DNS_MESSAGE_TYPE_A,
                klass: DNS_MESSAGE_CLASS_IN,
                ttl: DNS_DEFAULT_TTL,
                rdata: rdata
            });
        }
        return !!rdata;
    }

    function resolve(domain) {
        dns.lookup(domain, 4, function(err, address, family) {
            if (!err && family == 4) {
                if (self.cache) {
                    self.addresses[domain] = address;
                }
                pushAnswer(domain, address);
            }
            onresolve();
        });
    }

    function onresolve() {
        if (!length) return;
        if (!(--length)) {
            sendResponse();
        }
    }

    function sendResponse() {
        var length;
        msg.flags = DNS_MESSAGE_FLAG_QR | DNS_MESSAGE_FLAG_AA | DNS_MESSAGE_FLAG_RD | DNS_MESSAGE_FLAG_RA;
        msg.answers = answers;
        msg.authoritativeNameservers = [];
        msg.additionalRecords = [];
        length = msg.fillBuffer(responseBuffer);
        self.send(responseBuffer, 0, length, rinfo.port, rinfo.address);
    }
} // }}}

exports.createServer = function(options) {
    return Server(options);
};

exports.Server = Server;
// vim600: sw=4 ts=4 fdm=marker syn=javascript
