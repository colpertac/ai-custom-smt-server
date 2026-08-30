/*** Server settings for the game ***/

// Coin cost to play
const COIN_COST = 10;

// Reel item types mapped to the payout indexes below (invertly visually)
local REEL_ITEMS = [ [ 0, 0, 0 ],
                     [ 5, 8, 5 ],
                     [ 8, 5, 8 ],
                     [ 4, 4, 4 ],
                     [ 5, 6, 5 ],
                     [ 7, 5, 7 ],
                     [ 3, 3, 3 ],
                     [ 5, 7, 5 ],
                     [ 6, 5, 6 ],
                     [ 2, 2, 2 ],
                     [ 5, 6, 5 ],
                     [ 7, 5, 7 ],
                     [ 1, 1, 1 ],
                     [ 5, 7, 5 ],
                     [ 6, 5, 6 ] ];

// Payout for 3 of the same reel items in any of the 5 lines
local REEL_ITEM_PAYOUT = [ 100, 100, 100, 100, 100, 20, 30, 30, 50 ];

/*** DO NOT MODIFY BELOW THIS POINT ***/
local coinCount = 0;
local spinStart = 0.0;
local reels = [ 0, 0, 0 ];
local reelPending = [ false, false, false ];

function define(script)
{
    script.Name = "slot";
    script.Type = "WebGame";
    return 0;
}

function start(api, character, coins, out)
{
    coinCount = coins;

    // Set and send default reel states
    reels[0] = Randomizer.RNG(0, 14);
    reels[1] = Randomizer.RNG(0, 14);
    reels[2] = Randomizer.RNG(0, 14);

    api.SetResponse(out, "coinCost", COIN_COST.tostring());
    api.SetResponse(out, "reel1", reels[0].tostring());
    api.SetResponse(out, "reel2", reels[1].tostring());
    api.SetResponse(out, "reel3", reels[2].tostring());

    return 0;
}

function spin(api, session, params, out)
{
    // Pull time ASAP
    local now = api.GetSystemTime();

    if(spinStart != 0.0)
    {
        api.SetResponse(out, "error", "Invalid spin attempt");
        return 0;
    }

    if(coinCount < COIN_COST)
    {
        api.SetResponse(out, "error", "Not enough coins");
        return 0;
    }

    if(!api.UpdateCoins(session, -COIN_COST, true))
    {
        api.SetResponse(out, "error", "Payment failed");
        return 0;
    }

    coinCount = coinCount - COIN_COST;

    // Keep track of the spin start so we can calculate the correct results
    spinStart = now;

    api.SetResponse(out, "coins", coinCount.tostring());

    // Synch the correct starting reels
    api.SetResponse(out, "reel1", reels[0].tostring());
    api.SetResponse(out, "reel2", reels[1].tostring());
    api.SetResponse(out, "reel3", reels[2].tostring());

    // Mark all reels as pending stop
    reelPending[0] = reelPending[1] = reelPending[2] = true;

    return 0;
}

function stop(api, session, params, out)
{
    // Pull time ASAP
    local stopTime = api.GetSystemTime();

    local idx = params["reel"].tointeger();
    if(idx < 0 || idx > 2)
    {
        api.SetResponse(out, "error", "Invalid reel index supplied: " + idx.tostring());
        return 0;
    }

    if(!reelPending[idx])
    {
        api.SetResponse(out, "error", "Attempted to stop reel that is not spinning: " + idx.tostring());
        return 0;
    }

    reelPending[idx] = false;

    api.SetResponse(out, "reel", idx.tostring());

    // Calculate new reel
    local reelDelta = (((stopTime - spinStart) / 1000000.0 * 30.0) / 7.0).tointeger();
    reels[idx] = ((reels[idx] + reelDelta) % 15).tointeger();

    api.SetResponse(out, "reelResult", reels[idx].tostring());

    if(!reelPending[0] && !reelPending[1] && !reelPending[2])
    {
        // Calculate the result
        local reelVisible = [
                                // Top row
                                [ REEL_ITEMS[(reels[0] + 1) % 15][0],
                                  REEL_ITEMS[(reels[1] + 1) % 15][1],
                                  REEL_ITEMS[(reels[2] + 1) % 15][2] ],
                                // Middle row
                                [ REEL_ITEMS[reels[0]][0],
                                  REEL_ITEMS[reels[1]][1],
                                  REEL_ITEMS[reels[2]][2] ],
                                // Bottom row
                                [ REEL_ITEMS[(reels[0] + 14) % 15][0],
                                  REEL_ITEMS[(reels[1] + 14) % 15][1],
                                  REEL_ITEMS[(reels[2] + 14) % 15][2] ]
                            ];

        // Default to no match
        local spinResult = 0;
        local matchItem = -1;

        // Match diagonally or on any row
        if(reelVisible[0][0] == reelVisible[1][1] && reelVisible[0][0] == reelVisible[2][2])
        {
            // Diagonal down
            spinResult = 1;
            matchItem = reelVisible[0][0];
        }
        else if(reelVisible[0][0] == reelVisible[0][1] && reelVisible[0][0] == reelVisible[0][2])
        {
            // First row
            spinResult = 2;
            matchItem = reelVisible[0][0];
        }
        else if(reelVisible[1][0] == reelVisible[1][1] && reelVisible[1][0] == reelVisible[1][2])
        {
            // Second row
            spinResult = 3;
            matchItem = reelVisible[1][0];
        }
        else if(reelVisible[2][0] == reelVisible[2][1] && reelVisible[2][0] == reelVisible[2][2])
        {
            // Third row
            spinResult = 4;
            matchItem = reelVisible[2][0];
        }
        else if(reelVisible[2][0] == reelVisible[1][1] && reelVisible[2][0] == reelVisible[0][2])
        {
            // Diagonal up
            spinResult = 5;
            matchItem = reelVisible[2][0];
        }

        api.SetResponse(out, "spinResult", spinResult.tostring());

        if(spinResult)
        {
            local addCoin = REEL_ITEM_PAYOUT[matchItem];
            if(api.UpdateCoins(session, addCoin, true))
            {
                coinCount += addCoin;

                api.SetResponse(out, "coinDelta", addCoin.tostring());
            }
            else
            {
                api.SetResponse(out, "error", "Payout failed");
            }

            api.SetResponse(out, "matchItem", matchItem.tostring());
            api.SetResponse(out, "coins", coinCount.tostring());
        }

        spinStart = 0.0;
    }
    else
    {
        // Not done yet
        api.SetResponse(out, "spinResult", "-1");
    }

    return 0;
}