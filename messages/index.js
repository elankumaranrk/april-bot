/*-----------------------------------------------------------------------------
This template demonstrates how to use an IntentDialog with a LuisRecognizer to add 
natural language support to a bot. 
For a complete walkthrough of creating this type of bot see the article at
http://docs.botframework.com/builder/node/guides/understanding-natural-language/
-----------------------------------------------------------------------------*/
"use strict";
var builder = require("botbuilder");
var botbuilder_azure = require("botbuilder-azure");

var useEmulator = (process.env.NODE_ENV == 'development');


var connector = useEmulator ? new builder.ChatConnector() : new botbuilder_azure.BotServiceConnector({
    appId: process.env['MicrosoftAppId'],
    appPassword: process.env['MicrosoftAppPassword'],
    stateEndpoint: process.env['BotStateEndpoint'],
    openIdMetadata: process.env['BotOpenIdMetadata']
});

var bot = new builder.UniversalBot(connector);

// Make sure you add code to validate these fields
var luisAppId = process.env.LuisAppId;
var luisAPIKey = process.env.LuisAPIKey;
var luisAPIHostName = process.env.LuisAPIHostName || 'api.projectoxford.ai';

const LuisModelUrl = 'https://' + luisAPIHostName + '/luis/v2.0/apps/' + luisAppId + '?subscription-key=' + luisAPIKey;

// Welcome Dialog
var MainOptions = {
    Shop: 'main_options_order_flowers',
    Support: 'main_options_talk_to_support'
};

// Main dialog with LUIS
var recognizer = new builder.LuisRecognizer(LuisModelUrl);
var intents = new builder.IntentDialog({ recognizers: [recognizer] })
.matches('None', (session, args) => {
    session.send('Hi! This is the None intent handler. You said: \'%s\'.' + luisAppId, session.message.text);
})
.matches('greeting', (session, args) => {
    var welcomeCard = new builder.HeroCard(session)
        .title('welcome_title')
        .subtitle('welcome_subtitle')
        .images([
            new builder.CardImage(session)
                .url('https://placeholdit.imgix.net/~text?txtsize=56&txt=Contoso%20Flowers&w=640&h=330')
                .alt('contoso_flowers')
        ])
        .buttons([
            builder.CardAction.imBack(session, session.gettext(MainOptions.Shop), MainOptions.Shop),
            builder.CardAction.imBack(session, session.gettext(MainOptions.Support), MainOptions.Support)
        ]);

    session.send(new builder.Message(session)
        .addAttachment(welcomeCard));
})
.matches('addresschange', [
    function (session) {
        session.beginDialog('/addresschange');
    },
    function (session, results) {
        session.send('Ok... done!');
    }
])
.matches('weather', (session, args) => {
    session.send('Hmmm weather data has not been hooked up yet!');
})
.onDefault((session) => {
    session.send('Sorry, I did not understand \'%s\'.', session.message.text);
});

bot.dialog('/', intents);   

bot.dialog('/addresschange', [
     function (session, args, next) {
        // Resolve and store any entities passed from LUIS.
        session.send('Sure address change it is..whose address you would like to change?');
        var intent = args.intent;
        var who = builder.EntityRecognizer.findEntity(intent.entities, 'addresschange.forwho');
        var relation = builder.EntityRecognizer.findEntity(intent.entities, 'addresschange.forwho');
    
        // var alarm = session.dialogData.alarm = {
        //   title: title ? title.entity : null,
        //   timestamp: time ? time.getTime() : null  
        // };
        
        // Prompt for title
        if (!alarm.who) {
            builder.Prompts.text(session, 'Whose address needs a change?');
        } else {
            if(who =="my")
             session.send('Changing your address...');
            next();
        }
    },
    function(session, results) {
        session.endDialog();
    }

]) 

if (useEmulator) {
    var restify = require('restify');
    var server = restify.createServer();
    server.listen(3978, function() {
        console.log('test bot endpont at http://localhost:3978/api/messages');
    });
    server.post('/api/messages', connector.listen());    
} else {
    module.exports = { default: connector.listen() }
}

