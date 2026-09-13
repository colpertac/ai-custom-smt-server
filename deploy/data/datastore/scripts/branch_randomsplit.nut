function define(script)
{
    script.Name = "branch_randomSplit";
    script.Type = "EventBranchLogic";
    return 0;
}

// Branch based on a random number between 0 and a supplied value
// - params[0]: maximum branch number
function check(source, cState, dState, zone, params)
{
    if(params.len() != 1)
    {
        return -1;
    }

    return Randomizer.RNG(0, params[0].tointeger() - 1);
}