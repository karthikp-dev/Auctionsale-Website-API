const mongodb = require("mongodb");
const express = require("express");
let bodyparser = require("body-parser");
let nodemailer = require('nodemailer')
let app = express();

app.use(bodyparser.json());


//to resolve the CORS issue.
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
});
  
const connection_string =
"mongodb://auctionapi:auctapi1029@ds261155.mlab.com:61155/auction";

let db;


const connectdb = () => {
    mongodb.MongoClient.connect(
      connection_string,
      function(err, database) {
        if (err) {
          console.log(err);
          process.exit(1);
          }
          
        db = database.db("auction");
        console.log("Database connection ready");
      }
    );
  };

connectdb();
  
/*
@ assuming auction_item_name and user_email are unique
*/

app.post('/register_user', (req, res, next) => {
    
    db.collection('users').insertOne({
        fullname: req.body.fullname,
        email: req.body.email,
        password: req.body.password,
        bid_itmes: [],
        bid_amounts:[]
      }).then((err, data) => {
          if (err) {
              res.send(err)
          } else {
              res.sendStatus(200);
          }
      })
    
})


app.post('/register_item', (req, res) => {    
    //assuming the start and end times are stored in UNIX timestamp format.
    db.collection('auction_item').insertOne({
        name: req.body.name,
        description: req.body.description,
        start_time: req.body.start_time,
        end_time: req.body.end_time,
        starting_amount: req.body.starting_amount,
        image_url: req.body.image_url,
        isAuctioned: false,
        winner:'No one yet!!'
      }).then((err, data) => {
          if (err) {
              res.send(err)
          } else {
                //intializng the bid document in mongodb.
                db.collection('bids').insertOne({
                    item_name:req.body.name,
                    bid_amount:req.body.starting_amount,
                    buyer:[]     
                }).then((err, data) => {
                    if (err) {
                        res.send(err)
                    } else {
                        res.sendStatus(200);
                    }
                })
          }
      })
    
})




app.post('/item_details', (req, res, next) => {
    
    db.collection("auction_item")
    .find({name:req.body.name})
    .toArray(function(err, data) {
        if (err)
            res.send(err.message);
        else {
            if (data[0].isAuctioned) { 
                bid_document('enitre_doc'); //if auctioned already sending entire item-bid data.
            } else if (Date.now() < data[0].start_time) { //if item auction not yet started    
                res.send('Item auction not yet started')
            } else {   //if item is currently in auction => sending highest bid amount
                bid_document('highest_bid');
            }
        }
    });
    
    bid_document = (arg) => {
        db.collection('bids')
        .find({ item_name: req.body.name })
        .then((err, bid_data) => {
            if (err)
                res.send(err);
            else {
                if (arg == "enitre_doc") //if auctioned already sending entire item-bid data.
                {  res.send(bid_data) }
                else {
                    res.send(bid_data.bid_amount) //if item is currently in auction => sending highest bid amount
                }
            }
        })
    }
})

app.post('/list_items', (req, res, next) => {
    
    db.collection("auction_item")
    .find({})
    .toArray((err, data) => {
        
        if (err) {
            res.send(err.message);

        } else {
            let i;
            let past_auctions, current_auctions, upcoming_auctions = [];
            
            for (i = 0; i < data.length; i++){
                if (data[i].end_time > Date.now()) {
                    past_auctions.push(data[i])
                } else if (data[i].start_time < Date.now() && Date.now() < data[i].end_time) {
                    current_auctions.push(data[i])
                } else {
                    upcoming_auctions.push(data[i])
                }
            }

            res.send({
                past_auctions,
                current_auctions,
                upcoming_auctions
            });
        }
            
      });
    
})

//The below end point must hit only when user clicks BID button in front-end.
app.post('/save_bid', async (req, res) => {
    /* 
    I think the authentication for this api endpoint can be done easily 
    in the front-end(React) by only routing the user to bidding page if and only if he is logged in.
    */
    db.collection('auction_item')
        .find({ name: req.body.item_name })
        .then(async (err, data) => {
            if (err)
                res.send(err)
            else {
                if (Date.now() < data.end_time && !data.isAuctioned && req.body.bid_amount >= data.starting_amount) {
                    let temp = await db.collection('bids').find({ item_name: req.body.item_name })
                    buyer_temp = temp.buyer;
                    buyer_temp = [...buyer_temp, req.body.email]
                    amount_temp = temp.bid_amount;
                    amount_temp = [...amount_temp, req.body.bid_amount]
                    db.collection('bids').findOneAndUpdate(
                        { item_name: req.body.item_name },
                        { $set: { bid_amount: amount_temp, buyer: buyer_temp } }     
                        ).then((err, data) => {
                        if (err) {
                            res.send(err)
                        } else {
                            res.sendStatus(200);
                        }
                    })
                } else {                    
                    res.send('Item Already Auctioned!! Better Luck Next Time!!!')
                }
            }
        
        })
    
    let userdata_temp = await db.collection('users').find({ email: req.body.email })
    let bid_itmes_temp, bid_amounts_temp = [];
    bid_itmes_temp = userdata_temp.bid_itmes;
    bid_itmes_temp = [...bid_itmes_temp, req.body.item_name]
    bid_amounts_temp = userdata_temp.bid_amounts;
    bid_amounts_temp = [...bid_amounts_temp, req.body.bid_amount ]
    
    db.collection('users').findOneAndUpdate(
        { email: req.body.email },
        { $set: { bid_itmes: bid_itmes_temp , bid_amounts:bid_amounts_temp} }
    )
    

})

app.post('/list_bids_of_user', (req, res) => {
     /* 
    I think the authentication for this api endpoint can be done easily 
    in the front-end(React) by only routing the user to bidding page if and only if he is logged in.
    */
    db.collection('users').find({ email: req.body.email })
        .toArray(function (err, data) {
            if (err) {
            res.send(err.message);
            } else {
                res.send({
                    bid_items: data.bid_items,
                    bid_amount: data.bid_amounts
                });
        }
      });
})



email_service = (to_addresses,item_name,winner,bid_amount) => {
    
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: 'devtest.102938@gmail.com',
          pass: 'devtest.@10'
        }
    });
    
    let to = '';
    for (i = 0; i < to_addresses.length; i++){
        if(i == (to_addresses.length -1) )
            to = to + to_addresses[i]
        else {
            to = to + to_addresses[i] + ', '            
        }
            
    }
    let mailOptions = {
        from: 'devtest.102938@gmail.com',
        to: to,
        subject: 'BOH Auction Winner Announcement',
        text: `The winner of auction for ${item_name} is ${winner} at a closing price of ${bid_amount}`
        }
    
    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    })

}


function winner_announce() {
    db.collection('auction_item')
        .find({})
        .toArray((err, data) => {        
            let i = 0;
            for(i = 0; i < data.length; i++){
                if (Date.now() == data[i].end_time || (data[i].end_time - Date.now() < 1800)) {
                    //going to bids and fetching the winner and updating the auction_item document
                    let bid_data = {};
                    db.collection('bids')
                        .find({ item_name: data[i].name })
                        .then((bid_data_db) => {
                            bid_data = bid_data_db
                            let max_bid = Math.max.apply(null, bid_data.bid_amount)
                            let index = bid_data.bid_amount.indexOf(max_bid)
                            let winner = bid_data.buyer[index];
                            db.collection('auction_item').findOneAndUpdate(
                                { name: data[i].name },
                                { $set: { isAuctioned: true , winner:winner} } 
                            )

                            
                        })
                    
                        email_service(bid_data.buyer,data[i].name,winner,max_bid)
                        
                }
            }
        })
  }
  
call_infinite_loop = () => setInterval(winner_announce, 500);

setTimeout(call_infinite_loop, 3000)

app.listen(5607, () => {
    console.log("Server listening on port 5607");
});