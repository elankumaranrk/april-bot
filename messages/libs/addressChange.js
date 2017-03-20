var builder = require('botbuilder');
var locationDialog = require('./location/botbuilder-location');

var lib = new builder.Library('address');

// Register BotBuilder-Location dialog
lib.library(locationDialog.createLibrary('ApBn8xoItlENbFx-rr1kzt_JakWdFTH24taCasYxQCgit15NtDeYrztO4chDtrg5'));

// Main request address dialog, invokes BotBuilder-Location
lib.dialog('/', [
    function (session, args) {
        // Ask for address
        args = args || {};
        var promptMessage = args.promptMessage || 'default_address_prompt';
        session.dialogData.promptMessage = promptMessage;

        // Use botbuilder-location dialog for address request
        var options = {
            prompt: promptMessage,
            useNativeControl: true,
            reverseGeocode: true,
            requiredFields:
                locationDialog.LocationRequiredFields.streetAddress |
                locationDialog.LocationRequiredFields.locality 
        };

        locationDialog.getLocation(session, options);
    },
    function (session, results) {
        if (results.response) {
            // Return selected address to previous dialog in stack
            var place = results.response;
            var address = locationDialog.getFormattedAddressFromPlace(place, ', ');
            session.endDialogWithResult({
                address: address
            });
        } else {
            // No address resolved, restart
            session.replaceDialog('/', { promptMessage: session.dialogData.promptMessage });
        }
    }]);

    // Export createLibrary() function
module.exports.createLibrary = function () {
    return lib.clone();
};