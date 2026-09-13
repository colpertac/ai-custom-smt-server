function define(script)
{
    script.Name = "transforma_addDropsetRandom";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionCreateLoot command by adding a random dropset to the
// list based upon a specified weight.
// - params[0]+: Pair of dropset IDs and weights
function transform(source, cState, dState, zone, params)
{
    if(params.len() < 2 || (params.len() % 2) != 0)
    {
        return -1;
    }

    local sum = 0;
    for(local i = 0; i < (params.len() / 2); i++)
    {
        sum += params[(i * 2) + 1].tointeger();
    }

    local r = Randomizer.RNG(1, sum);
    for(local i = 0; i < (params.len() / 2); i++)
    {
        local range = params[(i * 2) + 1].tointeger();
        if(r <= range)
        {
            action.AppendDropSetIDs(params[i * 2].tointeger());
            return 0;
        }
        else
        {
            r -= range;
        }
    }

    // Shouldn't happen
    return -1;
}