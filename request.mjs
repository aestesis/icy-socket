import net from 'node:net';
import { EventEmitter } from 'node:events';
import tls from 'node:tls';

export class HttpRequest extends EventEmitter {
    constructor(url) {
        super();
        this.url = new URL(url);
    }
    async send(options = {}) {
        options = { ...{ method: 'GET' }, ...options };
        const url = this.url;
        let socket;
        if (url.protocol == 'https:') {
            const port = parseInt(url.port) || 443;
            socket = this.socket = tls.connect(port, url.hostname);
        } else {
            this.socket = new net.Socket();
            const port = parseInt(url.port) || 80;
            socket = this.socket.connect(port, url.hostname);
        }
        socket.on('connect', () => {
            socket.write(`${options.method} ${url.pathname}${url.search} HTTP/1.0\r\nHost: ${url.hostname}\r\nUser-Agent: Casty\r\nIcy-MetaData: 1\r\n\r\n`);
        });
        let data = new Buffer.alloc(0);
        socket.on('data', (d) => {
            if (!this.response) {
                data += d;
                const index = data.indexOf('\r\n\r\n');
                if (index) {
                    const h = data.slice(0, index + 4);
                    data = data.slice(index + 4);
                    const raw = h.toString('utf8');
                    this.response = this.parseResponse(raw);
                    this.emit('response', this.response);
                    if (data.length) {
                        this.emit('data', data);
                        data = undefined;
                    }
                }
            } else {
                this.emit('data', d);
            }
        });
        socket.on('end', (e) => {
            this.emit('end', e);
        });
        socket.on('error', (e) => {
            this.emit('error', e);
        });
    }
    parseResponse(text) {
        const response = { headers: {} };
        const hh = text.split('\r\n');
        const r = hh[0].split(' ');
        if (r.length != 3) throw 'invalid reponse';
        response.status = parseInt(r[1]);
        for (const h of hh.slice(1)) {
            if (h.length) {
                const p = h.split(':');
                response.headers[p[0].trim()] = p.slice(1).join(':').trim();
            }
        }
        return response;
    }
    request(url, options) {
        return;
    }

    destroy() {
        this.socket.destroy();
    }
    close() {
        this.destroy();
    }
}    