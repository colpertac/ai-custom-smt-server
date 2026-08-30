/*** Constants for prediction types ***/
const ALL_7 = 0;
const ALL_1 = 1;
const ALL_6 = 2;
const SUM_19 = 3;
const SUM_4 = 4;
const SUM_5 = 5;
const SUM_16 = 6;
const SUM_7 = 7;
const SUM_14 = 8;
const SUM_12 = 9;
const ALL_SAME_NUM = 10;
const ALL_ANGEL = 11;
const ALL_HUMAN = 12;
const HAS_NON_FALLEN = 13;
const HAS_ANGEL_CAP = 14;
const ORDER_LNC = 15;
const EMPTY_10 = 16;
const COIN_MULTIPLIER = 17;
const COIN_PER_TURN = 18;
const LOSS_GUARD = 19;
const EASY_ANGEL_CAP = 20;
const EASY_ANY_CAP = 21;
const EASY_ANGEL = 22;
const HAS_NO_FALLEN_CAP = 23;

/*** Server settings for the game ***/

// Coin cost to set any prediction
local PREDICT_COSTS = [ 100, 20, 666, 4, 4, 4, 4, 4, 4, 4,
                        15, 40, 3, 5, 30, 5, 50, 20, 50, 10,
                        600, 300, 500, 40 ];

// Coin payout per prediction
local PREDICT_WINNINGS = [ 77777, 11111, 666666, 26, 22, 18, 14, 14, 12, 12,
                           500, 70, 10, 5, 50, 25, 400, 10, 1, 10,
                           0, 0, 0, 30 ];

// Maximum number of times a prediction can be made per round
local PREDICT_LIMITS = [ 10, 10, 10, 10, 10, 10, 10, 10, 10, 10,
                         10, 10, 10, 7, 4, 10, 10, 5, 1, 1,
                         1, 1, 1, 1 ];

// Default starting jackpot
const BASE_JACKPOT = 777777;

/*** DO NOT MODIFY BELOW THIS POINT ***/
local playerName = "";
local coinCount = 0;
local betTotal = 0;
local pendingCoins = 0;
local jackpot = 0;
local turn = 0;
local wins = 0;
local currentBets = null;

function define(script)
{
    script.Name = "kino";
    script.Type = "WebGame";
    return 0;
}

function start(api, character, coins, out)
{
    playerName = character.GetName();
    coinCount = coins;

    // Set the starting jackpot
    jackpot = BASE_JACKPOT;

    api.SetResponse(out, "jackpot", jackpot.tostring());
    api.SetResponse(out, "predictCosts", arrayToJSON(PREDICT_COSTS));
    api.SetResponse(out, "predictWinnings", arrayToJSON(PREDICT_WINNINGS));
    api.SetResponse(out, "predictLimits", arrayToJSON(PREDICT_LIMITS));

    return 0;
}

function arrayToJSON(arr)
{
    local str = "[";
    for(local idx = 0; idx < arr.len(); idx++)
    {
        if(idx != 0)
        {
            str = str + ", ";
        }

        str = str + arr[idx].tostring();
    }
    str = str + " ]";

    return str;
}

function bet(api, session, params, out)
{
    local bets = split(params["bets"], ",");
    if(bets.len() != 24)
    {
        api.SetResponse(out, "error", "Invalid bet count supplied");
        return 0;
    }

    local total = 0;
    local converted = [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                     0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                     0, 0, 0, 0 ];
    for(local i = 0; i < 24; i++)
    {
        local b = bets[i].tointeger();
        if(b > 0 && b > PREDICT_LIMITS[i])
        {
            api.SetResponse(out, "error", "One or more bet limits exceeded");
            return 0;
        }

        total += PREDICT_COSTS[i] * b;
        converted[i] = b;
    }

    if(total > coinCount)
    {
        api.SetResponse(out, "error", "Bet exceeds available coin amount");
        return 0;
    }

    if(!api.UpdateCoins(session, -total, true))
    {
        api.SetResponse(out, "error", "Coin update failed");
        return 0;
    }

    betTotal = total;
    coinCount = coinCount - total;
    currentBets = converted;

    api.SetResponse(out, "betTotal", betTotal.tostring());
    api.SetResponse(out, "coins", coinCount.tostring());

    return 0;
}

function draw(api, session, params, out)
{
    if(currentBets == null)
    {
        api.SetResponse(out, "error", "No bets have been placed");
        return 0;
    }

    // "cards" parameter supplied but it exists to make the
    // player feel good about their lack of choice :)
    turn++;

    local allCards = [
                        // Angels (captain, 1-7)
                        0, 1, 2, 3, 4, 5, 6, 7,
                        // Humans (1-7)
                        11, 12, 13, 14, 15, 16, 17,
                        // Fallen angels (captain, 1-7)
                        20, 21, 22, 23, 24, 25, 26, 27 ];

    // Kino cheats by slipping in additional devil cards each time you win
    // You don't become a successful street swindler by playing fair :)
    for(local i = 0; i < wins; i++)
    {
        allCards.append(Randomizer.RNG(20, 27));
        if(i >= 3)
        {
            allCards.append(Randomizer.RNG(20, 27));
            if(i >= 6)
            {
                allCards.append(Randomizer.RNG(20, 27));
            }
        }
    }

    if(currentBets[EASY_ANGEL_CAP])
    {
        allCards.append(0);
        allCards.append(0);
    }

    if(currentBets[EASY_ANY_CAP])
    {
        allCards.append(0);
        allCards.append(0);
        allCards.append(0);
        allCards.append(20);
        allCards.append(20);
        allCards.append(20);
    }

    if(currentBets[EASY_ANGEL])
    {
        // Add three of the angel cards a second time
        allCards.append(Randomizer.RNG(0, 7));
        allCards.append(Randomizer.RNG(0, 7));
        allCards.append(Randomizer.RNG(0, 7));
    }

    // Draw 3 distinct cards
    local card1 = allCards[Randomizer.RNG(0, allCards.len() - 1)];
    for(local i = allCards.len() - 1; i >= 0; i--)
    {
        if(allCards[i] == card1)
        {
            allCards.remove(i);
        }
    }

    local card2 = allCards[Randomizer.RNG(0, allCards.len() - 1)];
    for(local i = allCards.len() - 1; i >= 0; i--)
    {
        if(allCards[i] == card2)
        {
            allCards.remove(i);
        }
    }

    local card3 = allCards[Randomizer.RNG(0, allCards.len() - 1)];

    local total = (card1 % 10) + (card2 % 10) + (card3 % 10);

    local type1 = (card1 / 10).tointeger();
    local type2 = (card2 / 10).tointeger();
    local type3 = (card3 / 10).tointeger();
	
	local card1v = card1 % 10;
	local card2v = card2 % 10;
	local card3v = card3 % 10;

    local turnResult = 0;
    local hits = [];
    local paid = [];
    if(currentBets[HAS_NO_FALLEN_CAP])
    {
        if(card1 == 20 || card2 == 20 || card3 == 20)
        {
            // Fallen angel captain drawn, automatically lose
            turnResult = -1;
        }
        else
        {
            hits.append(HAS_NO_FALLEN_CAP);
        }
    }

    // Don't bother with the rest if the player already lost
    if(turnResult != -1)
    {
        hits.append(COIN_PER_TURN);

        if(currentBets[COIN_MULTIPLIER] &&
            pendingCoins >= (currentBets[COIN_MULTIPLIER] * 100))
        {
            hits.append(COIN_MULTIPLIER);
        }

        if(type1 == type2 && type1 == type3)
        {
            switch(type1)
            {
                case 0:
                    // All angels (win)
                    hits.append(ALL_ANGEL);
                    turnResult = 1;
                    break;
                case 1:
                    // All humans
                    hits.append(ALL_HUMAN);
                    break;
                case 2:
                    // All fallen angels (lose)
                    if(currentBets[LOSS_GUARD] && pendingCoins >= 666)
                    {
                        // Prevent loss and reduce pending coins
                        pendingCoins = 10;
                        //currentBets[LOSS_GUARD] = 0;
                        turnResult = -2;
                    }
                    else
                    {
                        turnResult = -1;
                        pendingCoins = 0;
                    }
                    break;
            }
        }
        else if(type1 == 0 && type2 == 1 && type3 == 2)
        {
            // Angel -> human -> fallen angel
            hits.append(ORDER_LNC);
        }
        else if((type2 == 2 && type3 == 2 && type1 != 2) ||
            (type1 == 2 && type3 == 2 && type2 != 2) ||
            (type1 == 2 && type2 == 2 && type3 != 2))
        {
            // Only one non-fallen angel
            hits.append(HAS_NON_FALLEN);
        }
    }

    if(turnResult > -1)
    {
        switch(total)
        {
            case 4:
                hits.append(SUM_4);
                break;
            case 5:
                hits.append(SUM_5);
                break;
            case 7:
                hits.append(SUM_7);
                break;
            case 12:
                hits.append(SUM_12);
                break;
            case 14:
                hits.append(SUM_14);
                break;
            case 16:
                hits.append(SUM_16);
                break;
            case 19:
                hits.append(SUM_19);
                break;
        }

        if(card1v == card2v && card1v == card3v)
        {
            switch(card1v)
            {
                case 1:
                    hits.append(ALL_1);
                    break;
                case 6:
                    hits.append(ALL_6);
                    break;
                case 7:
                    hits.append(ALL_7);
                    break;
            }

            hits.append(ALL_SAME_NUM);
        }

        if(card1 == 0 || card2 == 0 || card3 == 0)
        {
            hits.append(HAS_ANGEL_CAP);
        }

        // Increase the pending coin count
        for(local i = 0; i < hits.len(); i++)
        {
            local b = hits[i];
            if(currentBets[b] == 0) continue;

            if(b == COIN_MULTIPLIER)
            {
                pendingCoins += PREDICT_WINNINGS[b] * currentBets[b];
            }
            else if(b == COIN_PER_TURN)
            {
                pendingCoins += PREDICT_WINNINGS[b] * turn * currentBets[b];
            }
            else
            {
                pendingCoins += PREDICT_WINNINGS[b] * currentBets[b];
            }

            paid.append(b);
        }

        if(currentBets[EMPTY_10] && turn == 10 && paid.len() == 0)
        {
            pendingCoins += PREDICT_WINNINGS[EMPTY_10] * currentBets[EMPTY_10];
            paid.append(EMPTY_10);
        }
    }
    else if(turnResult == -2)
    {
        paid.append(LOSS_GUARD);
        turnResult = 0;
    }

    api.SetResponse(out, "cards", arrayToJSON([ card1, card2, card3 ]));
    api.SetResponse(out, "paid", arrayToJSON(paid));
    api.SetResponse(out, "total", total.tostring());
    api.SetResponse(out, "turn", turn.tostring());

    if(turnResult)
    {
        if(turnResult == 1)
        {
            wins++;
            if(wins % 10 == 0)
            {
                print(playerName + " just won the Kino jackpot!");
                turnResult = 2;
                pendingCoins += jackpot;
            }
        }

        // Write pending coin amount before the remaining win or loss logic
        api.SetResponse(out, "pendingCoins", pendingCoins.tostring());

        if(turnResult >= 1)
        {
            if(!api.UpdateCoins(session, pendingCoins, true))
            {
                api.SetResponse(out, "error", "Coin update failed");
                return 0;
            }

            coinCount = coinCount + pendingCoins;
        }
        else
        {
            wins = 0;
        }

        // Reset values
        pendingCoins = 0;
        turn = 0;
        betTotal = 0;
        currentBets = null;
    }
    else
    {
        api.SetResponse(out, "pendingCoins", pendingCoins.tostring());
    }

    api.SetResponse(out, "coins", coinCount.tostring());
    api.SetResponse(out, "turnResult", turnResult.tostring());
    api.SetResponse(out, "wins", wins.tostring());

    return 0;
}