import net from 'node:net';
import { EventEmitter } from 'node:events';
import tls from 'node:tls';

export class IcyRequest extends EventEmitter {
    constructor(url, options = {}) {
        super();
        this.url = new URL(url);
        this.options = options;
    }
    async send(options = {}) {
        options = {
            ...{ method: 'GET', timeout: 2000, redirect: true, version: '1.1', rawStream: false },
            ...this.options,
            ...options
        };
        const url = this.url;
        let socket;
        if (url.protocol == 'https:') {
            const port = parseInt(url.port) || 443;
            socket = this.socket = tls.connect(port, url.hostname);
        } else {
            const port = parseInt(url.port) || 80;
            this.socket = new net.Socket();
            socket = this.socket.connect(port, url.hostname);
        }
        const timeout = setTimeout(() => {
            this.emit('error', 'timeout');
            socket.destroy();
        }, options.timeout);
        socket.on('connect', () => {
            clearTimeout(timeout);
            socket.write(`${options.method} ${url.pathname}${url.search} HTTP/${options.version}\r\nHost: ${url.hostname}\r\nUser-Agent: Casty\r\nIcy-MetaData: 1\r\n\r\n`);
        });
        let data = new Buffer.alloc(0);
        socket.on('data', (d) => {
            data = Buffer.concat([data, d]);
            if (!this.response) {
                const index = data.indexOf('\r\n\r\n');
                if (index >= 0) {
                    const h = data.slice(0, index + 4);
                    data = data.slice(index + 4);
                    const raw = h.toString('utf8');
                    const response = this.response = this.parseResponse(raw);
                    const headers = response.headers;
                    if (options.redirect && Math.floor(response.status.code / 100) == 3 && headers.location) {
                        const redirected = [...this.redirected || [], this.url.toString()];
                        const nurl = new URL(headers.location, this.url);
                        const req = new IcyRequest(nurl);
                        if (redirected.includes(req.url.toString())) {
                            this.emit('error', 'infinite redirection');
                            return;
                        }
                        req.redirected = redirected;
                        req.on('error', (e) => this.emit('error', e));
                        req.on('response', (e) => this.emit('response', e));
                        req.on('meta', (e) => this.emit('meta', e));
                        req.on('data', (e) => this.emit('data', e));
                        this.redirection = req;
                        req.send(options);
                        return;
                    }
                    this.emit('response', response);
                    this.metaInt = options.rawStream ? 0 : parseInt(headers['icy-metaint']) || 0;
                    if (!this.metaInt && data.length) {
                        this.emit('data', data);
                        data = Buffer.alloc(0);
                    }
                }
            } else {
                if (this.metaInt) {
                    const metaInt = this.metaInt;
                    while (data.length > metaInt) {
                        const byte = data.readUInt8(metaInt)
                        const metaSize = byte * 16 + 1;
                        if (data.length >= metaInt + metaSize) {
                            if (metaSize > 1) {
                                const buffer = data.slice(metaInt + 1, metaInt + metaSize);
                                const meta = this.parseMeta(buffer);
                                if (meta) {
                                    this.emit('meta', meta);
                                }
                            }
                            this.emit('data', data.slice(0, metaInt));
                            data = data.slice(metaInt + metaSize);
                        } else {
                            break;
                        }
                    }
                } else {
                    this.emit('data', d);
                }
            }
        });
        socket.on('end', () => {
            this.emit('end');
        });
        socket.on('error', (error) => {
            clearTimeout(timeout);
            this.emit('error', error.toString());
        });
    }
    parseMeta(buffer) {
        const text = buffer.toString('ascii').split(';');
        const meta = {};
        for (const t of text) {
            const p = t.split('=');
            if (p.length == 2) {
                const k = p[0].trim().toLowerCase();
                let v = p[1].trim();
                if (v.length && v[0] == "'" && v[v.length - 1] == "'") {
                    v = v.substring(1, v.length - 1);
                }
                meta[k] = v;
            }
        }
        return meta;
    }
    parseResponse(text) {
        const response = { headers: {} };
        const hh = text.split('\r\n');
        const r = hh[0].split(' ');
        response.status = { code: parseInt(r[1]), message: r.slice(2).join(' ') };
        for (const h of hh.slice(1)) {
            if (h.length) {
                const p = h.split(':');
                response.headers[p[0].trim().toLowerCase()] = p.slice(1).join(':').trim();
            }
        }
        return response;
    }
    destroy() {
        if (this.redirection) {
            this.redirection.destroy();
        }
        this.socket.destroy();
    }
    close() {
        this.destroy();
    }
}    