function define(script)
{
    script.Name = "action_flagRangeSet";
    script.Type = "ActionCustom";
    return 0;
}

// Set character flag values (or value lists) at a starting key with optional
// percentages to apply them. If the starting key has a non-zero value already,
// the starting key will be increased until a zero value is encountered.
// - params[0]: Starting key
// - params[1]: Designates the number of additional values to store sequentially
// - params[2]: If 1, designates that percentages are included
// - params[3]+: Flag value pairs (and percentages to apply)
function run(source, cState, dState, zone, server, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(params.len() < 4 || zone == null || worldCID == 0)
    {
        return Result_t.FAIL;
    }

    local key = params[0].tointeger();
    local listSize = params[1].tointeger();
    local percentIncluded = params[2].tointeger() >= 1;
    local valueSize = 1 + listSize + (percentIncluded ? 1 : 0);

	while(zone.GetFlagState(key, 0, worldCID) != 0)
    {
        key++;
    }

    for(local i = 3; i < (params.len() - (valueSize - 1));)
    {
        local setKey = !percentIncluded;
        if(percentIncluded)
        {
            local chance = params[i + (valueSize - 1)].tointeger();
			local precision = (10 * pow(10, params[2].tointeger()));
            setKey = chance >= precision || chance >= Randomizer.RNG(1, precision);
        }

        if(setKey)
        {
            zone.SetFlagState(key++, params[i].tointeger(), worldCID);

            for(local k = 0; k < listSize; k++)
            {
                zone.SetFlagState(key++, params[i + k + 1].tointeger(), worldCID);
            }
        }

        i += valueSize;
    }

    return Result_t.SUCCESS;
}