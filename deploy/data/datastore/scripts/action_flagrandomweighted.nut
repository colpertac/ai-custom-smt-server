function define(script)
{
    script.Name = "action_flagRandomWeighted";
    script.Type = "ActionCustom";
    return 0;
}

// Set a zone flag to a random weighted value.
// - params[0]: Destination flag key
// - params[1]: Destination flag type: ZONE, INSTANCE, CHARACTER or
//   INSTANCE_CHARACTER
// - params[2]+: List of weights then values, remaining params
//   must be divisible by 2 to specify weights for each.
function run(source, cState, dState, zone, server, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(params.len() < 4 || params.len() % 2 != 0 || zone == null)
    {
        return Result_t.FAIL;
    }

    local type = params[1];
    if(zone.GetZoneInstance() == null &&
        (type == "INSTANCE" || type == "INSTANCE_CHARACTER"))
    {
        return Result_t.FAIL;
    }
    else if(worldCID <= 0 &&
        (type == "CHARACTER" || type == "INSTANCE_CHARACTER"))
    {
        return Result_t.FAIL;
    }

    local weights = [];
    local values = [];
    local weightTotal = 0;
    for(local i = 2; i < params.len(); i++)
    {
        if(i >= ((params.len() / 2) + 1))
        {
            values.append(params[i].tointeger());
        }
        else
        {
            weights.append(params[i].tointeger());
            weightTotal += params[i].tointeger();
        }
    }

    local rVal = Randomizer.RNG(1, weightTotal);

    local value = 0;
    for(local i = 0; i < weights.len(); i++)
    {
        if(rVal <= weights[i])
        {
            value = values[i];
            break;
        }
        else
        {
            rVal -= weights[i];
        }
    }

    if(type == "ZONE" || type == "CHARACTER")
    {
        zone.SetFlagState(params[0].tointeger(), value,
            type == "ZONE" ? 0 : worldCID);
    }
    else if(type == "INSTANCE" || type == "INSTANCE_CHARACTER")
    {
        zone.GetZoneInstance().SetFlagState(params[0].tointeger(), value,
            type == "INSTANCE" ? 0 : worldCID);
    }
    else
    {
        return Result_t.FAIL;
    }

    return Result_t.SUCCESS;
}