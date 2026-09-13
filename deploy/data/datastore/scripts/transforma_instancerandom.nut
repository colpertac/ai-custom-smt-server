function define(script)
{
    script.Name = "transforma_instanceRandom";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionZoneInstance command to use a random instance ID
// - params[0]+: Possible instance IDs
function transform(source, cState, dState, zone, params)
{
    if(params.len() < 1)
    {
        return -1;
    }

    action.SetInstanceID(params[Randomizer.RNG(0, params.len() - 1)].tointeger());

    return 0;
}