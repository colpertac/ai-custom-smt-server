function define(script)
{
    script.Name = "transforma_slgMultiply";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionSpawn command by adding a set of spawn location group
// IDs a supplied number of times based on a zone flag value. Including spawn
// location group IDs already on the action, will result in them being included.
// - params[0]: Zone flag ID with the multiplier value in it
// - params[1]+: Valid spawn location group IDs to add equal to 1 x the multiplier
function transform(source, cState, dState, zone, params)
{
    if(zone == null || params.len() < 2)
    {
        return -1;
    }

    local multiplier = params[0].tointeger();
    local slgID = params[Randomizer.RNG(1, params.len() - 1)].tointeger();
    for(local i = 0; i < zone.GetFlagState(multiplier, 0, 0); i++)
    {
        action.AppendSpawnLocationGroupIDs(slgID);
    }

    return 0;
}