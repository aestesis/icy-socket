import { HttpRequest } from './request.mjs';

//const request = new HttpRequest('http://jenx.globalconnection.world:8000');
const request = new HttpRequest('https://io.waves.pw/radio.ogg');


request.on('response', (r) => {
    console.log('response', JSON.stringify(r));
});
request.on('data', (d) => {
    request.close();
});

request.send({method:'GET'});
