function define(script)
{
    script.Name = "branch_randomWeighted";
    script.Type = "EventBranchLogic";
    return 0;
}

// Branch based on a random number selected from the sum of a set of ranges
// - params[0]+: list of numbers representing random "weights"
function check(source, cState, dState, zone, params)
{
    if(params.len() == 0)
    {
        return -1;
    }

    local sum = 0;
    for(local i = 0; i < params.len(); i++)
    {
        sum += params[i].tointeger();
    }

    local r = Randomizer.RNG(1, sum);
    for(local i = 0; i < params.len(); i++)
    {
        local range = params[i].tointeger();
        if(r <= range)
        {
            return i;
        }
        else
        {
            r -= range;
        }
    }

    // Shouldn't happen
    return -1;
}