function define(script)
{
    script.Name = "branch_randomSplitGender";
    script.Type = "EventBranchLogic";
    return 0;
}

// Branch based on a random number between 0 and a supplied value
// for male (first set) or female (second set)
// - params[0]: maximum branch number per gender
function check(source, cState, dState, zone, params)
{
    local character = cState ? cState.GetEntity() : null;
    if(params.len() != 1 || character == null)
    {
        return -1;
    }

    local branch = Randomizer.RNG(0, params[0].tointeger() - 1);
    if(character.Gender == Character_Gender_t.FEMALE)
    {
        branch += params[0].tointeger();
    }

    return branch;
}