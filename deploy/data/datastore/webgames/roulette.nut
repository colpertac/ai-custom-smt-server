/*** Server settings for the game ***/

// Coin cost to play
const COIN_COST = 50;

// Maximum number of times the player can double up an outside bet
const MAX_DOUBLE_UP = 4;

// Default starting jackpot
const BASE_JACKPOT = 120;

// Modulus value used to calculate the current jackpot from the system time
const JACKPOT_MOD = 1337;

// Multiplier value used to calculate the current jackpot from the system time
const JACKPOT_MULT = 11;

// Black (0) or Red (1) mapping for numeric values at index value - 1
local COLOR_MAP = [ 1, 0, 1, 0, 1, 0, 1, 0, 1, 0,
                    0, 1, 0, 1, 0, 1, 0, 1, 1, 0,
                    1, 0, 1, 0, 1, 0, 1, 0, 0, 1,
                    0, 1, 0, 1, 0, 1 ];

/*** DO NOT MODIFY BELOW THIS POINT ***/
local coinCount = 0;
local playerBetType = -1;
local playerBetValue = -1;
local playerDoubleUp = 0;
local jackpot = 0;

function define(script)
{
    script.Name = "roulette";
    script.Type = "WebGame";
    return 0;
}

function start(api, character, coins, out)
{
    coinCount = coins;

    // Set the starting jackpot
    jackpot = getCurrentJackpot(api);

    api.SetResponse(out, "cost", COIN_COST.tostring());
    api.SetResponse(out, "maxDoubleUp", MAX_DOUBLE_UP.tostring());
    api.SetResponse(out, "jackpot", jackpot.tostring());

    return 0;
}

function bet(api, session, params, out)
{
    local betType = params["betType"].tointeger();
    if(betType < -1 || betType > 1)
    {
        api.SetResponse(out, "error", "Invalid bet type supplied");
        return 0;
    }

    local betValue = params["betValue"].tointeger();
    if((betType == -1 && betValue != -1) ||
        (betType == 0 && (betValue < 0 || betValue > 37)) ||
        (betType == 1 && (betValue < 0 || betValue > 5)))
    {
        api.SetResponse(out, "error", "Invalid bet supplied");
        return 0;
    }

    local doubleUp = params["doubleUp"].tointeger();
    if(doubleUp > 0 && betType != 1)
    {
        api.SetResponse(out, "error", "Double up attempted on non-outside bet");
        return 0;
    }
    else if(doubleUp > MAX_DOUBLE_UP)
    {
        api.SetResponse(out, "error", "Double up exceeded maximum number allowed");
        return 0;
    }

    if(betType != -1 && coinCount < getCoinCost(doubleUp))
    {
        api.SetResponse(out, "error", "Not enough coins");
        return 0;
    }

    playerBetType = betType;
    playerBetValue = betValue;
    playerDoubleUp = doubleUp;

    return 0;
}

function spin(api, session, params, out)
{
    if(playerBetType == -1)
    {
        api.SetResponse(out, "error", "Spin is not valid until bet has been placed");
        return 0;
    }

    local cost = getCoinCost(playerDoubleUp);
    if(coinCount < cost)
    {
        api.SetResponse(out, "error", "Not enough coins");
        return 0;
    }

    local delta = 0;

    local result = Randomizer.RNG(0, 37);

    local win = false;
    if(playerBetType == 0)
    {
        // Inside bet
        if(playerBetValue == result)
        {
            // Pay and reset jackpot
            api.SetResponse(out, "resultType", "JACKPOT");
            api.SetResponse(out, "coinsWon", jackpot.tostring());

            delta = jackpot;
            jackpot = BASE_JACKPOT;

            win = true;
        }
    }
    else
    {
        // Outside bet (ignores 0 and 00)
        if(result != 0 && result != 37)
        {
            switch(playerBetValue)
            {
                case 0:
                    // Black
                    win = COLOR_MAP[result - 1] == 0;
                    break;
                case 1:
                    // Red
                    win = COLOR_MAP[result - 1] == 1;
                    break;
                case 2:
                    // Even
                    win = result % 2 == 0;
                    break;
                case 3:
                    // Odd
                    win = result % 2 == 1;
                    break;
                case 4:
                    // 1 to 18
                    win = result >= 1 && result <= 18;
                    break;
                case 5:
                    // 19 to 36
                    win = result >= 19 && result <= 36;
                    break;
            }

            if(win)
            {
                delta = cost;

                api.SetResponse(out, "resultType", "WIN");
                api.SetResponse(out, "coinsWon", cost.tostring());
            }
        }
    }

    if(!win)
    {
         delta = -cost;
    }

    if(!api.UpdateCoins(session, delta, true))
    {
        api.SetResponse(out, "error", "Coin update failed");
        return 0;
    }

    if(!win)
    {
        api.SetResponse(out, "resultType", "LOSE");
    }

    // Get the new jackpot
    jackpot = getCurrentJackpot(api);

    coinCount = coinCount + delta;

    api.SetResponse(out, "spinResult", result.tostring());
    api.SetResponse(out, "coins", coinCount.tostring());
    api.SetResponse(out, "jackpot", jackpot.tostring());

    return 0;
}

function getCurrentJackpot(api)
{
    return (api.GetSystemTime() / 1000000) % JACKPOT_MOD * JACKPOT_MULT;
}

function getCoinCost(dbUp)
{
    return COIN_COST * pow(2.0, dbUp);

    local cost = COIN_COST;

    local multiplier = 1;
    if(dbUp > 0)
    {
        for(local i = 0; i < dbUp; i++)
        {
            multiplier = multiplier * 2;
        }
    }

    return cost * multiplier;
}