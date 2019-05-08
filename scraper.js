// Parses the development applications at the South Australian City of Mitcham web site and places
// them in a database.
//
// Michael Bone
// 14th July 2018

let cheerio = require("cheerio");
let request = require("request-promise-native");
let sqlite3 = require("sqlite3").verbose();
let moment = require("moment");

const DevelopmentApplicationsUrl = "https://eproperty.mitchamcouncil.sa.gov.au/T1PRProd/WebApps/eProperty/P1/eTrack/eTrackApplicationSearchResults.aspx?Field=S&Period=L28&r=P1.WEBGUEST&f=%24P1.ETR.SEARCH.SL28";
const DevelopmentApplicationUrl = "https://eproperty.mitchamcouncil.sa.gov.au/T1PRProd/WebApps/eProperty/P1/eTrack/eTrackApplicationDetails.aspx?r=P1.WEBGUEST&f=%24P1.ETR.APPDET.VIW&ApplicationId=";
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
    return new Promise((resolve, reject) => {
        let sqlStatement = database.prepare("insert or replace into [data] values (?, ?, ?, ?, ?, ?, ?, ?, ?)");
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
                console.error(error);
                reject(error);
            } else {
                console.log(`    Saved application \"${developmentApplication.applicationNumber}\" into the database.`);
                sqlStatement.finalize();  // releases any locks
                resolve(row);
            }
        });
    });
}

// Parses the development applications.

async function main() {
    // Ensure that the database exists.

    let database = await initializeDatabase();

    // Retrieve the first page.

    let body = await request(DevelopmentApplicationsUrl);
    let $ = cheerio.load(body);

    // Examine the HTML to determine how many pages need to be retrieved.

    let pageCount = Math.max(1, $("tr.pagerRow td").length - 1);
    let eventValidation = $("input[name='__EVENTVALIDATION']").val();
    let viewState = $("input[name='__VIEWSTATE']").val();

    if (pageCount === 1)
        console.log(`There is ${pageCount} page to parse.`)
    else
        console.log(`There are ${pageCount} pages to parse.`)

    // Process the text from each page.

    for (let pageIndex = 1; pageIndex <= pageCount; pageIndex++) {
        console.log(`Parsing page ${pageIndex} of ${pageCount}.`);

        // Retrieve a subsequent page.

        if (pageIndex >= 2) {
            try {
                let body = await request.post({
                    url: DevelopmentApplicationsUrl,
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    form: {
                        __EVENTARGUMENT: `Page$${pageIndex}`,
                        __EVENTTARGET: "ctl00$Content$cusResultsGrid$repWebGrid$ctl00$grdWebGridTabularView",
                        __EVENTVALIDATION: eventValidation,
                        __VIEWSTATE: viewState
                }});
                $ = cheerio.load(body);
            } catch (ex) {
                console.log(ex);
                console.log("Continuing to the next page.");
                continue;
            }
        }

        // Use cheerio to find all development applications listed in the current page.

        for (let element of $("table.grid td a").get()) {
            // Check that a valid development application number was provided.

            let applicationNumber = element.children[0].data.trim();
            if (!/^[0-9][0-9][0-9]\/[0-9][0-9][0-9][0-9]\/[0-9][0-9]$/.test(applicationNumber))
                continue;

            // Retrieve the page that contains the details of the development application.

            let developmentApplicationUrl = DevelopmentApplicationUrl + encodeURIComponent(applicationNumber);
            let body = null;
            try {
                body = await request(developmentApplicationUrl);
            } catch (ex) {
                console.log(ex);
                console.log("Continuing to the next development application.");
                continue;
            }

            // Extract the details of the development application and insert those details into the
            // database as a row in a table.

            let $ = cheerio.load(body);
            let receivedDate = moment($("td.headerColumn:contains('Lodgement Date') ~ td").text().trim(), "D/MM/YYYY", true);  // allows the leading zero of the day to be omitted
            let address = $($("table.grid th:contains('Address')").parent().parent().find("tr.normalRow td")[0]).text().trim();
            let reason = $("td.headerColumn:contains('Description') ~ td").text().trim();  

            if (address.length > 0) {
                await insertRow(database, {
                    applicationNumber: applicationNumber,
                    address: address,
                    reason: reason,
                    informationUrl: developmentApplicationUrl,
                    commentUrl: CommentUrl,
                    scrapeDate: moment().format("YYYY-MM-DD"),
                    receivedDate: receivedDate.isValid ? receivedDate.format("YYYY-MM-DD") : ""
                });
            }
        }
    }
}

main().then(() => console.log("Complete.")).catch(error => console.error(error));
