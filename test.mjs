import { IcyRequest } from './request.mjs';

//const request = new IcyRequest('http://radio.openstageis.land');
//const request = new IcyRequest('http://jenx.globalconnection.world:8000');
//const request = new IcyRequest('http://djthirteen.lightmanstreams.com:8460');
const request = new IcyRequest('https://waves.pw');
//const request = new IcyRequest(' https://io.waves.pw/radio.ogg');


request.on('response', (r) => {
    console.log('response', JSON.stringify(r));
    if(!r.headers['icy-metaint']) {
        request.close();
    }
});
request.on('meta', (d) => {
    console.log('meta', d);
    request.close();
});
request.on('error', (error) => {
    console.log(error);
})
request.send();

/*
function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

(async () => {
    while (true) {
        await delay(1000);
    }
})();
*/