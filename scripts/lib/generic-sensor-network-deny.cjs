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
const dnsPromises = require("node:dns/promises");
const dgram = require("node:dgram");

function denyDnsModuleMethods(target, namespace) {
  for (const name of Object.getOwnPropertyNames(target)) {
    if (typeof target[name] !== "function" || !/^(?:lookup|lookupService|reverse|resolve.*)$/.test(name)) continue;
    target[name] = () => deny(`${namespace}.${name}`);
  }
}

function denyDnsResolverMethods(Resolver, namespace) {
  for (const name of Object.getOwnPropertyNames(Resolver.prototype)) {
    if (typeof Resolver.prototype[name] !== "function" || !/^(?:reverse|resolve.*)$/.test(name)) continue;
    Resolver.prototype[name] = function resolverDenied() {
      return deny(`${namespace}.${name}`);
    };
  }
}

net.connect = net.createConnection = () => deny("net.connect");
net.Socket.prototype.connect = function connectDenied() {
  return deny("net.Socket.connect");
};
tls.connect = () => deny("tls.connect");
http.request = http.get = () => deny("http.request");
https.request = https.get = () => deny("https.request");
denyDnsModuleMethods(dns, "dns");
denyDnsResolverMethods(dns.Resolver, "dns.Resolver");
denyDnsModuleMethods(dns.promises, "dns.promises");
denyDnsModuleMethods(dnsPromises, "dns/promises");
denyDnsResolverMethods(dns.promises.Resolver, "dns.promises.Resolver");
if (dnsPromises.Resolver !== dns.promises.Resolver) denyDnsResolverMethods(dnsPromises.Resolver, "dns/promises.Resolver");
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
