function define(script)
{
    script.Name = "transforma_questFlag";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionUpdateQuest command by copying the values of zone
// character flags into a quest flags
// - params[0]+: Pairs of zone character flag keys and quest flag keys
function transform(source, cState, dState, zone, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(zone == null || worldCID <= 0 || (params.len() % 2) != 0)
    {
        return -1;
    }

    for(local i = 0; i < (params.len() - 1);)
    {
        local zoneKey = params[i].tointeger();
        local questKey = params[i + 1].tointeger();

        action.SetFlagStatesEntry(questKey,
            zone.GetFlagState(zoneKey, 0, worldCID));

        i += 2;
    }

    return 0;
}