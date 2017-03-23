"use strict";
var builder = require("botbuilder");
var Promise = require('bluebird');
var fs = require('fs');
var btoa = require('btoa');
var requestApi = require('request');
var request = require('request-promise').defaults({
    encoding: null
});
var botbuilder_azure = require("botbuilder-azure");
var spellService = require('./services/spell-service');
// var vision = require('./libs/vision/src/index')({
//     projectId: 'april-web',
//     keyFilename: './april-web.json'
// });
// var locationDialog = require('botbuilder-location');
var states = ['MN']; //add all states later on.
var visionApiUrl = "https://vision.googleapis.com/v1/images:annotate?key=";

var useEmulator = (process.env.NODE_ENV == 'development');
var connector = useEmulator ? new builder.ChatConnector() : new botbuilder_azure.BotServiceConnector({
    appId: process.env['MicrosoftAppId'],
    appPassword: process.env['MicrosoftAppPassword'],
    stateEndpoint: process.env['BotStateEndpoint'],
    openIdMetadata: process.env['BotOpenIdMetadata']
});
var visionApiKey = "AIzaSyDkv1RkFwucps0uwqgVbN_5ZxxKWcF8pPk";

// Make sure you add code to validate these fields
var luisAppId = process.env.LuisAppId;
var luisAPIKey = process.env.LuisAPIKey;
var luisAPIHostName = process.env.LuisAPIHostName || 'api.projectoxford.ai';
const LuisModelUrl = 'https://' + luisAPIHostName + '/luis/v2.0/apps/' + luisAppId + '?subscription-key=' + luisAPIKey;



if (useEmulator) {
    var restify = require('restify');
    var server = restify.createServer();
    server.listen(3978, function () {
        console.log('test bot endpont at http://localhost:3978/api/messages');
    });
    server.post('/api/messages', connector.listen());
} else {
    module.exports = {
        default: connector.listen()
    }
}
var whichAddress = {
    Business: 'Business',
    Residence: 'Residence',
    Both: 'Both'
};

var bot = new builder.UniversalBot(connector, function (session) {
    session.send('Sorry, I did not understand \'%s\'. Type \'help\' if you need assistance.', session.message.text);
});

var recognizer = new builder.LuisRecognizer(LuisModelUrl);
bot.recognizer(recognizer);
bot.library(require('./libs/addressChange').createLibrary());

bot.dialog('addresschange', [
    function (session, args, next) {
        // session.send('Hello, address update it is!');

        // try extracting entities
        var relation = builder.EntityRecognizer.findEntity(args.intent.entities, 'addresschange.forwho::addresschange.personrelation');
        var which = builder.EntityRecognizer.findEntity(args.intent.entities, 'busres');
        var policyNumber = builder.EntityRecognizer.findEntity(args.intent.entities, 'addresschange.forwho::addresschange.policynumber');

        if (relation) {
            // relation detected
            if (relation.entity == "my") {
                session.dialogData.addressChangeType = "own";
                if (which) {
                    session.send('Okay, let\'s change your ' + which.entity + ' address!');
                    session.dialogData.ownBusRes = which.entity;
                    next({
                        response: which.entity
                    });
                } else {
                    builder.Prompts.choice(
                        session,
                        'Sure, but which address specifically?', [whichAddress.Both, whichAddress.Business, whichAddress.Residence], {
                            maxRetries: 3,
                            retryPrompt: 'Not a valid option'
                        });
                }
            } else if (relation.entity == "owner" || relation.entity == "insured") {
                session.dialogData.addressChangeType = relation.entity;
                if (policyNumber) {
                    session.dialogData.policyNumber = policyNumber.entity;
                    session.send('Okay, let\'s change policy ' + policyNumber.entity + '\'s ' + relation.entity + ' address!');
                    next({
                        response: policyNumber.entity
                    });
                } else {
                    builder.Prompts.text(session, 'Sure, but ' + relation.entity + ' of which policy number specifically?');
                }
            }
        } else {
            // no entities detected, ask user for a destination
            session.send('Sorry but I do not understand');
            session.replaceDialog('addressChange');
        }
    },
    function (session, results) {
        var answer = results.response;
        if (session.dialogData.addressChangeType == "own" && !session.dialogData.ownBusRes) {
            session.dialogData.ownBusRes = answer.entity;
            session.send('Okay, let\'s change your ' + answer.entity + ' address!');
        }
        if ((session.dialogData.addressChangeType == "owner" || session.dialogData.addressChangeType == "insured") && !session.dialogData.policyNumber) {
            session.dialogData.policyNumber = answer;
            session.send('Okay, let\'s change policy ' + answer + '\'s ' + session.dialogData.addressChangeType + ' address!');
        }
        builder.Prompts.confirm(session, 'Would you like to take a snap of any government ID with address & upload?');
    },
    function (session, results) {
        if (results.response) {
            builder.Prompts.attachment(session, 'Awesome! please go ahead and upload one.');
        } else {
            session.beginDialog('address:/', {
                promptMessage: 'That\'s no problem, '
            });
        }
    },
    function (session, results, next) {
        var msg = session.message;

        if (msg.attachments.length > 0) {
            var reply2 = new builder.Message(session)
                .text('Inside Total Attachments received' + session.message.attachments.length);
            session.send(reply2);

            // Message with attachment, proceed to download it.
            // Skype & MS Teams attachment URLs are secured by a JwtToken, so we need to pass the token from our bot.
            var attachment = msg.attachments[0];
            var fileDownload = checkRequiresToken(msg) ?
                requestWithToken(attachment.contentUrl) :
                request(attachment.contentUrl);

            fileDownload.then(
                function (response) {

                    // Send reply with attachment type & size
                    var reply = new builder.Message(session)
                        .text('Attachment of %s type and size of %s bytes received.', attachment.contentType, response.length);
                    session.send(reply);

                }).catch(function (err) {
                console.log('Error downloading attachment:', {
                    statusCode: err.statusCode,
                    message: err.response.statusMessage
                });
            });
        } else {
            session.dialogData.AttachmentAddress = "None";
            next({
                address: results.address
            });
        }
    },
    function (session, results) {
        var answer = results.address;
        if (session.dialogData.AttachmentAddress == "None") {
            session.dialogData.NewAddress = answer;
        }
        var text = "";
        if (session.dialogData.addressChangeType == "own") {
            text = `Your new  ${ownBusRes}  `;
        } else {
            text = `The new address of the ${session.dialogData.addressChangeType} of the policy ${ session.dialogData.policyNumber} `
        }
        var msg = new builder.Message(session).addAttachment(new builder.HeroCard(session)
            .title('Address Change Completed')
            .subtitle(`New address: ${session.dialogData.NewAddress}`)
            .text(`${text} has been updated in our system and a confirmation mail will be sent to the new & old address in 2 business days. Thank you!`)
            .images([
                builder.CardImage.create(session, 'http://clipartix.com/wp-content/uploads/2016/04/Smiley-face-clip-art-thumbs-up-free-clipart-images-2-3.png')
            ]));
        session.send(msg);
        session.endDialog();

    }
]).triggerAction({
    matches: 'addresschange',
    onInterrupted: function (session) {
        session.send('Please provide a destination');
    }
});

bot.dialog('allocationchange', function (session, args) {
    session.endDialog('Hi! Sorry changing allocations are not yet supported');
}).triggerAction({
    matches: 'allocationchange'
});

bot.dialog('help', function (session) {
    session.endDialog('Hi! Try telling me things like \'change an address for a policy owner\', \'do an allocation change\'');
}).triggerAction({
    matches: 'help'
});

// Spell Check
if (true) {
    bot.use({
        botbuilder: function (session, next) {
            spellService
                .getCorrectedText(session.message.text)
                .then(function (text) {
                    session.message.text = text;
                    next();
                })
                .catch(function (error) {
                    console.error(error);
                    next();
                });
        }
    });
}

// Helpers
function hotelAsAttachment(hotel) {
    return new builder.HeroCard()
        .title(hotel.name)
        .subtitle('%d stars. %d reviews. From $%d per night.', hotel.rating, hotel.numberOfReviews, hotel.priceStarting)
        .images([new builder.CardImage().url(hotel.image)])
        .buttons([
            new builder.CardAction()
            .title('More details')
            .type('openUrl')
            .value('https://www.bing.com/search?q=hotels+in+' + encodeURIComponent(hotel.location))
        ]);
}

function reviewAsAttachment(review) {
    return new builder.ThumbnailCard()
        .title(review.title)
        .text(review.text)
        .images([new builder.CardImage().url(review.image)]);
}

// Request file with Authentication Header
var requestWithToken = function (url) {
    return obtainToken().then(function (token) {
        return request({
            url: url,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/octet-stream'
            }
        });
    });
};

// Promise for obtaining JWT Token (requested once)
var obtainToken = Promise.promisify(connector.getAccessToken.bind(connector));

var checkRequiresToken = function (message) {
    return message.source === 'skype' || message.source === 'msteams';
};

function base64_encode(file) {
    var bitmap = fs.readFileSync(file);
    return new Buffer(bitmap).toString('base64');
}