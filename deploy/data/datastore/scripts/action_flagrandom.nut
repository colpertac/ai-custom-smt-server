function define(script)
{
    script.Name = "action_flagRandom";
    script.Type = "ActionCustom";
    return 0;
}

// Set a zone flag to a random value between a supplied min/max.
// - params[0]: Destination flag key
// - params[1]: Min value
// - params[2]: Max value
// - params[3]: Destination flag type: ZONE (default), INSTANCE,
//   CHARACTER or INSTANCE_CHARACTER
// - params[4]: If 1, instead distribute all numbers in the range in a random
//   order to the flags starting with the supplied key
function run(source, cState, dState, zone, server, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(params.len() < 2 || zone == null)
    {
        return Result_t.FAIL;
    }

    local key = params[0].tointeger();
    local min = params[1].tointeger();
    local max = params[2].tointeger();
    local type = params.len() >= 4 ? params[3] : "ZONE";

    if(min > max)
    {
        return Result_t.FAIL;
    }

    if(type != "ZONE" && type != "INSTANCE" &&
        type != "CHARACTER" && type != "INSTANCE_CHARACTER")
    {
        return Result_t.FAIL;
    }
    else if(type != "CHARACTER" && type != "INSTANCE_CHARACTER")
    {
        worldCID = 0;
    }

    local flagSource = null;
    if(type == "ZONE" || type == "CHARACTER")
    {
        flagSource = zone;
    }
    else
    {
        flagSource = zone.GetZoneInstance();
    }

    if(flagSource == null)
    {
        return Result_t.FAIL;
    }

    if(params.len() >= 5 && params[4].tointeger() == 1)
    {
        local valArray = [];
        for(local i = min; i <= max; i++)
        {
            valArray.append(i);
        }

        for(local x = min; x <= max; x++)
        {
            local i = Randomizer.RNG(0, valArray.len() - 1);
            flagSource.SetFlagState(key++, valArray[i], worldCID);

            valArray.remove(i);
        }
    }
    else
    {
        flagSource.SetFlagState(key, Randomizer.RNG(min, max), worldCID);
    }

    return Result_t.SUCCESS;
}