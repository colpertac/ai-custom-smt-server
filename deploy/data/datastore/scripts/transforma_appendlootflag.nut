function define(script)
{
    script.Name = "transforma_appendLootFlag";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionCreateLoot command by appending a dropset ID from the
// value stored in a zone flag
// - params[0] = Flag key
// - params[1]: Source flag type: ZONE (default), INSTANCE, CHARACTER or
//   INSTANCE_CHARACTER
function transform(source, cState, dState, zone, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    local fType = params.len() > 1 ? params[1] : "ZONE";
    if(params.len() < 1 || zone == null ||
        (fType != "ZONE" && fType != "INSTANCE" &&
        fType != "CHARACTER" && fType != "INSTANCE_CHARACTER"))
    {
        return -1;
    }
    else if(fType != "CHARACTER" && fType != "INSTANCE_CHARACTER")
    {
        worldCID = 0;
    }

    local flagSource = null;
    if(fType == "ZONE" || fType == "CHARACTER")
    {
        flagSource = zone;
    }
    else
    {
        flagSource = zone.GetZoneInstance();
    }

    if(flagSource == null)
    {
        return -1;
    }

    local val = flagSource.GetFlagState(params[0].tointeger(), 0, worldCID);
    if(val == 0)
    {
        // Not a failure but don't do anything
        return 0;
    }

    action.AppendDropSetIDs(val);

    return 0;
}