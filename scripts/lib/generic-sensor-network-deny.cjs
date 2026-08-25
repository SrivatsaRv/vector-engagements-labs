"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- Node --require preload must initialize synchronously before ESM evaluation. */

const { syncBuiltinESMExports } = require("node:module");

function deny(operation) {
  throw new Error(`NETWORK_ACCESS_DISABLED:${operation}`);
}

const net = require("node:net");
const tls = require("node:tls");
const http = require("node:http");
const https = require("node:https");
const dns = require("node:dns");
const dgram = require("node:dgram");

net.connect = net.createConnection = () => deny("net.connect");
net.Socket.prototype.connect = function connectDenied() {
  return deny("net.Socket.connect");
};
tls.connect = () => deny("tls.connect");
http.request = http.get = () => deny("http.request");
https.request = https.get = () => deny("https.request");
dns.lookup = dns.resolve = dns.resolve4 = dns.resolve6 = () => deny("dns.resolve");
dns.promises.lookup = dns.promises.resolve = dns.promises.resolve4 = dns.promises.resolve6 = () => deny("dns.promises.resolve");
dgram.Socket.prototype.bind = function bindDenied() {
  return deny("dgram.Socket.bind");
};
dgram.Socket.prototype.connect = function connectDenied() {
  return deny("dgram.Socket.connect");
};
dgram.Socket.prototype.send = function sendDenied() {
  return deny("dgram.Socket.send");
};
globalThis.fetch = () => deny("fetch");

syncBuiltinESMExports();
