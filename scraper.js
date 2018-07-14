// Parses the development application at the South Australian City of Mitcham web site and places them
// in a database.
//
// Michael Bone
// 14th July 2018

let cheerio = require("cheerio");
let request = require("request-promise-native");
let sqlite3 = require("sqlite3").verbose();
let urlparser = require("url");
let moment = require("moment");

const DevelopmentApplicationsUrl = "https://eproperty.mitchamcouncil.sa.gov.au/T1PRProd/WebApps/eProperty/P1/eTrack/eTrackApplicationSearchResults.aspx?Field=S&Period=L28&r=P1.WEBGUEST&f=%24P1.ETR.SEARCH.SL28";
const CommentUrl = "mailto:mitcham@mitchamcouncil.sa.gov.au";

// Sets up an sqlite database.

function initializeDatabase(callback) {
    let database = new sqlite3.Database("data.sqlite");
    database.serialize(() => {
        database.run("create table if not exists [data] ([council_reference] text primary key, [address] text, [description] text, [info_url] text, [comment_url] text, [date_scraped] text, [date_received] text, [on_notice_from] text, [on_notice_to] text)");
        callback(database);
    });
}

// Inserts a row in the database if it does not already exist.

function insertRow(database, developmentApplication) {
    let sqlStatement = database.prepare("insert or ignore into [data] values (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    sqlStatement.run([
        developmentApplication.applicationNumber,
        developmentApplication.address,
        developmentApplication.reason,
        developmentApplication.informationUrl,
        developmentApplication.commentUrl,
        developmentApplication.scrapeDate,
        null,
        null,
        null
    ], function(error, row) {
        if (error)
            console.log(error);
        else {
            if (this.changes > 0)
                console.log(`    Inserted new application \"${developmentApplication.applicationNumber}\" into the database.`);
            sqlStatement.finalize();  // releases any locks
        }
    });
}

// Reads a page using a request.
    
function requestPage(url, callback) {
    console.log(`Requesting page: ${url}`);
    request(url, (error, response, body) => {
        if (error)
            console.log(`Error requesting page ${url}: ${error}`);
        else
            callback(body);
    });
}

// Parses the page at the specified URL.

function run(database) {
    let url = DevelopmentApplicationsUrl;
    let parsedUrl = new urlparser.URL(url);
    let baseUrl = parsedUrl.origin + parsedUrl.pathname;

    
    requestPage(url, body => {
        // Use cheerio to find all development applications listed in the page.
 
        let $ = cheerio.load(body);
        $("table.grid td a").each((index, element) => {
            // Each development application is listed with a link to another page which has the
            // full development application details.

            console.log(element.attribs.href);

            let applicationNumber = $(element).text().trim();
            if (/^[0-9][0-9][0-9]\/[0-9][0-9][0-9][0-9]\/[0-9][0-9]$/.test(applicationNumber)) {
                let developmentApplicationUrl = "https://eproperty.mitchamcouncil.sa.gov.au/T1PRProd/WebApps/eProperty/P1/eTrack/eTrackApplicationDetails.aspx?r=P1.WEBGUEST&f=%24P1.ETR.APPDET.VIW&ApplicationId=" + encodeURIComponent(applicationNumber);
                console.log(developmentApplicationUrl);
                requestPage(developmentApplicationUrl, body => {
                    // Extract the details of the development application from the development
                    // application page and then insert those details into the database as a row
                    // in a table.

                    let $ = cheerio.load(body);

                    // insertRow(database, {
                    //     applicationNumber: $("span.field-label:contains('Application number') ~ span.field-value").text().trim(),
                    //     address: $("span.field-label:contains('Address') ~ span.field-value").text().replace("View Map", "").trim(),
                    //     reason: $("span.field-label:contains('Nature of development') ~ span.field-value").text().trim(),
                    //     informationUrl: developmentApplicationUrl,
                    //     commentUrl: CommentUrl,
                    //    scrapeDate: moment().format("YYYY-MM-DD")
                });
            }
        });
    });
}

async function test() {
    let body = await request(DevelopmentApplicationsUrl);
    let $ = cheerio.load(body);
    $("table.grid td a").each((index, element) => {
        let applicationNumber = $(element).text().trim();
        console.log(applicationNumber);
    });
}

test();
// initializeDatabase(run);
