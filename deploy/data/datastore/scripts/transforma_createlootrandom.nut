function define(script)
{
    script.Name = "transforma_createLootRandom";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionCreateLoot command by adding one specified set randomly from a list.
//params[0, 2, 4+] = dropsetIDs
//params[1, 3, 5+] = chance of previous dropset being added
function transform(source, cState, dState, zone, params)
{
    local instance = zone != null ? zone.GetZoneInstance() : null;
    if(instance == null || params.len() < 2 || params.len() % 2 != 0)
    {
        return -1;
    }

    local drops = null;
    local sum = 0;
    for(local i = 1; i < params.len(); i+=2)
    {
        sum += params[i].tointeger();
    }

    local r = Randomizer.RNG(1, sum);
    for(local i = 0; i < params.len(); i+=2)
    {
        local range = params[i+1].tointeger();
        if(r <= range)
        {
            drops = params[i].tointeger();
            break;
        }
        else
        {
            r -= range;
        }
    }

    if(drops == null)
    {
        return -1;
    }

    action.AppendDropSetIDs(drops);

    return 0;
}