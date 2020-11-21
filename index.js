'use strict';

const admin = require('firebase-admin');
//const functions = require('firebase-functions');
const
	express = require('express'),
	bodyParser = require('body-parser'),
	app = express().use(bodyParser.json()); // creates express http server
const request = require('request');
const cors = require('cors');
const { json } = require('body-parser');

var serviceAccount = require("./api-project-1043471755179-firebase-adminsdk-4mp3o-3012520e2d.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://api-project-1043471755179.firebaseio.com"
});

const firedb = admin.firestore();

//const pageAccessTokenMap = {};

// firedb.collection("page_token").get()
// .then(tokens => {
//     if(!tokens.exists) throw new Error('the page token not found');
//     pageAccessTokenArr = tokens.data().fb_pages;
// 	for (let index = 0; index < pageAccessTokenArr.length; index++) {
// 		pageAccessTokenMap[pageAccessTokenArr[index].id] = pageAccessTokenArr[index].access_token;
//     }
// })
// .catch(error => console.log(error));

const clientId = process.env.FB_CLIENT_ID || "370258737579452";
const secret = process.env.FB_CLIENT_SECRET || "33d05b117067e32174e41468ebcf31ac";
const webhookVerifyToken = process.env.FB_VERIFY_TOKEN || "123@abc";

app.use(cors({ origin: true }));


function getLeadDetails(leadData) {
	// Algorithm
	// Get the page access for the page for which this lead was generated.
	// Get the lead details then
	
	//Get the page access token from db.
	firedb.collection("page_token").doc(leadData.page_id).get()
	.then(pageData => {
		if(!pageData.exists) throw new Error('the page token not found');
		let access_token = pageData.data().access_token;
		let options = { 
			method: 'GET',
			url: `https://graph.facebook.com/${leadData.leadgen_id}?access_token=${access_token}`,
			json: true
		};
		console.log(options);
		request(options, (error, response, body) => {
			console.log(error, body)
			
			firedb.collection("leads").doc(leadData.leadgen_id).set(body)
			.then(()=> console.log("New lead updated"))
			.catch((error)=> console.log("new lead created", error));	
		})
	})
	.catch(error => console.log(error));
}


app.post('/webhook', (req, res) => {  
		let body = req.body;
		console.log(JSON.stringify(body));
		res.status(200).send('EVENT_RECEIVED');
		// Checks this is an event from a page subscription
		/*
		{"object":"page","entry":[{"id":"694933407528358","time":1605955462,"changes":[{"value":{"form_id":"357882802178738","leadgen_id":"134171078138870","created_time":1605955462,"page_id":"694933407528358"},"field":"leadgen"}]}]}
		*/
		if (body.object === 'page') {
	
			// Iterates over each entry - there may be multiple if batched
			body.entry.forEach(function(entry) {
				if (entry.changes) {
					entry.changes.forEach(function(eachLead) {
						if (eachLead.field == "leadgen") {
							getLeadDetails(eachLead.value);
						}
					})
				}
			});
	
			// Returns a '200 OK' response to all requests
			res.status(200).send('EVENT_RECEIVED');
		} else {
			// Returns a '404 Not Found' if event is not from a page subscription
			res.sendStatus(404);
		}
	
});

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {

		// Your verify token. Should be a random string.
			
		// Parse the query params
		let mode = req.query['hub.mode'];
		let token = req.query['hub.verify_token'];
		let challenge = req.query['hub.challenge'];
			
		// Checks if a token and mode is in the query string of the request
		if (mode && token) {
		
			// Checks the mode and token sent is correct
			if (mode === 'subscribe' && token === webhookVerifyToken) {
				
				// Responds with the challenge token from the request
				console.log('WEBHOOK_VERIFIED');
				res.status(200).send(challenge);
			
			} else {
				// Responds with '403 Forbidden' if verify tokens do not match
				res.sendStatus(403);      
			}
		}
});

function subscribePage(eachPage) {
	let options = { 
		method: 'POST',
		url: `https://graph.facebook.com/${eachPage.id}/subscribed_apps?subscribed_fields=leadgen&access_token=${eachPage.access_token}`,
		json: true
	};
	console.log(options);
	request(options, (error, response, body) => {
		console.log(error, body)
	})
}

app.get('/addPages', (req, res) => {
	let user_access_token = req.query['user_access_token'];
	let leadplus_clientid = req.query['leadplus_clientid'];

	let options = { 
		method: 'GET',
		url: `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${secret}&fb_exchange_token=${user_access_token}`,
		json: true
	};
	console.log(options);
	request(options, (error, response, body) => {
		if (error || body.error) {
			console.log(error);
		} else {
			console.log(body);
			let options = { 
				method: 'GET',
				url: `https://graph.facebook.com/me/accounts?fields=name,access_token&access_token=${body.access_token}`,
				json: true
			};
			console.log(options);
			request(options, (error, response, body) => {
				if (error) {
					console.log(error);
				} else {
					console.log(body);
					if (body.data.length) {
						for (let index = 0; index < body.data.length; index++) {
							const eachPage = body.data[index];
							let docRef = firedb.collection("page_token").doc(eachPage.id)
							docRef.set({
								access_token : eachPage.access_token,
								leadplus_clientid : leadplus_clientid,
								page_id : eachPage.id,
								page_name : eachPage.name
							})
							.then(()=> console.log("New token updated"))
							.catch((error)=> console.log("new token update failed", error));	

							subscribePage(eachPage);
						}
					}
				}
			});

		}
	});	
	res.status(200).send('OK');
});


//exports.webApi = functions.https.onRequest(app);

// Sets server port and logs message on success
let port =  process.env.PORT || 1337;
app.listen(port, () => console.log('webhook is listening', port));
