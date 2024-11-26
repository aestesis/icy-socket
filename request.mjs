import net from 'node:net';
import { EventEmitter } from 'node:events';
import tls from 'node:tls';

export class IcyRequest extends EventEmitter {
    constructor(url) {
        super();
        this.url = new URL(url);
    }
    async send(options = {}) {
        options = { ...{ method: 'GET', timeout: 2000 }, ...options };
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
            socket.write(`${options.method} ${url.pathname}${url.search} HTTP/1.0\r\nHost: ${url.hostname}\r\nUser-Agent: Casty\r\nIcy-MetaData: 1\r\n\r\n`);
        });
        let data = new Buffer.alloc(0);
        socket.on('data', (d) => {
            data = Buffer.concat([data, d]);
            if (!this.response) {
                const index = data.indexOf('\r\n\r\n');
                if (index) {
                    const h = data.slice(0, index + 4);
                    data = data.slice(index + 4);
                    const raw = h.toString('utf8');
                    this.response = this.parseResponse(raw);
                    this.emit('response', this.response);
                    const headers = this.response.headers;
                    this.metaInt = parseInt(headers['icy-metaint']) || 0;
                    if (!this.metaInt && data.length) {
                        this.emit('data', data);
                        data = undefined;
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
            this.emit('error', error.toString);
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
        if (r.length != 3) throw `invalid reponse ${hh[0]}`;
        response.status = parseInt(r[1]);
        for (const h of hh.slice(1)) {
            if (h.length) {
                const p = h.split(':');
                response.headers[p[0].trim().toLowerCase()] = p.slice(1).join(':').trim();
            }
        }
        return response;
    }
    destroy() {
        this.socket.destroy();
    }
    close() {
        this.destroy();
    }
}    