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

async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        let database = new sqlite3.Database("data.sqlite");
        database.serialize(() => {
            database.run("create table if not exists [data] ([council_reference] text primary key, [address] text, [description] text, [info_url] text, [comment_url] text, [date_scraped] text, [date_received] text, [on_notice_from] text, [on_notice_to] text)");
            resolve(database);
        });
    });
}

// Inserts a row in the database if it does not already exist.

async function insertRow(database, developmentApplication) {
    console.log(developmentApplication);
    return new Promise((resolve, reject) => {
        let sqlStatement = database.prepare("insert or ignore into [data] values (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        sqlStatement.run([
            developmentApplication.applicationNumber,
            developmentApplication.address,
            developmentApplication.reason,
            developmentApplication.informationUrl,
            developmentApplication.commentUrl,
            developmentApplication.scrapeDate,
            developmentApplication.receivedDate,
            null,
            null
        ], function(error, row) {
            if (error) {
                console.log(error);
                reject(error);
            }
            else {
                if (this.changes > 0)
                    console.log(`    Inserted new application \"${developmentApplication.applicationNumber}\" into the database.`);
                sqlStatement.finalize();  // releases any locks
                resolve(row);
            }
        });
    });
}

// Parses the page at the specified URL.

async function main() {
    let database = await initializeDatabase();
    let body = await request(DevelopmentApplicationsUrl);

    // Use cheerio to find all development applications listed in the page.

    let $ = cheerio.load(body);
    $("table.grid td a").each(async (index, element) => {
        // Each development application is listed with a link to another page which has the
        // full development application details.

        let applicationNumber = $(element).text().trim();
        if (/^[0-9][0-9][0-9]\/[0-9][0-9][0-9][0-9]\/[0-9][0-9]$/.test(applicationNumber)) {
            let developmentApplicationUrl = "https://eproperty.mitchamcouncil.sa.gov.au/T1PRProd/WebApps/eProperty/P1/eTrack/eTrackApplicationDetails.aspx?r=P1.WEBGUEST&f=%24P1.ETR.APPDET.VIW&ApplicationId=" + encodeURIComponent(applicationNumber);
            console.log(developmentApplicationUrl);
            let body = await request(developmentApplicationUrl);

            // Extract the details of the development application from the development application
            // page and then insert those details into the database as a row in a table.

            let $ = cheerio.load(body);
            await insertRow(database, {
                applicationNumber: applicationNumber,
                address: "",
                reason: $("td.headerColumn:contains('Description') ~ td").text().trim(),
                informationUrl: developmentApplicationUrl,
                commentUrl: CommentUrl,
                scrapeDate: moment().format("YYYY-MM-DD"),
                receivedDate: moment($("td.headerColumn:contains('Lodgement Date') ~ td").text().trim(), "D/MM/YYYY", true).format("YYYY-MM-DD"),  // allows the leading zero of the day to be omitted
            });
        }
    });
}

main();
