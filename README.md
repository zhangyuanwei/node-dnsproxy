node-dnsproxy
==============

A simple DNS proxy server for Node.js  
一个简单的 Node.js DNS 代理服务器  

## Installation 安装

``` shell
npm install dnsproxy               # install from npm
sudo dnsproxy -a a.com:127.0.0.1 & # start dns proxy server
dig @localhost a.com               # test the server, return 127.0.0.1
```

## Usage 使用

``` text
Usage: dnsproxy [-?hv] [-b address] [-p port] [-c true|false] [-a domain1:ip1 [domain2:ip2 [...]]] [-f filename]

Options:
  -?,-h         : this help
  -v            : show version and exit
  -b address    : set bind address
  -p port       : set bind port(default: 53)
  -c true|false : enable/disable cache
  -a domain:ip  : add one or more DNS recode
  -f filename   : load options from file
```

## Pan-analytic 泛解析
``` shell
sudo dnsproxy -a *.a.com:127.0.0.1 *.b.a.com:127.0.0.2 &
dig @localhost xx.a.com    # return 127.0.0.1
dig @localhost xx.b.a.com  # return 127.0.0.2
```

## Who am I 我是谁
``` shell
# start server on 192.168.1.1
sudo dnsproxy -a who.am.i:localhost who.you.are:proxyhost &

# run on 192.168.1.2
dig @192.168.1.1 who.am.i    # return 192.168.1.2
dig @192.168.1.1 who.you.are # return 192.168.1.1

# run on 192.168.1.3
dig @192.168.1.1 who.am.i   # return 192.168.1.3
dig @192.168.1.1 who.you.are # return 192.168.1.1
```
