function define(script)
{
    script.Name = "transforma_zoneChangeRandom";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionZoneChange command to use a random zoneID/spotID pair.
// - params[0, 2, 4+]: Possible zoneIDs
// - params[1, 3, 5+]: Possible spotIDs
function transform(source, cState, dState, zone, params)
{
    if(params.len() % 2 != 0)
    {
        return -1;
    }
    local pairs = params.len() / 2;
    local selected = (Randomizer.RNG(0, pairs - 1) * 2);
    action.SetZoneID(params[selected].tointeger());
    action.SetSpotID(params[selected + 1].tointeger());

    return 0;
}