function define(script)
{
    script.Name = "transforma_zoneChangeDynamic";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionZoneChange command to use the key values from two flags
// for the zoneID/spotID pair.
// - params[0]: Flag type: ZONE, INSTANCE, CHARACTER or
//   INSTANCE_CHARACTER
// - params[1]: value to add to current zoneID when zoneID not set, flag to
//   load the value to add to the zoneID when set
// - params[2]: Flag key to use for spotID (optional)
function transform(source, cState, dState, zone, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(params.len() < 2 || zone == null ||
        (params[0] != "ZONE" && params[0] != "INSTANCE" &&
        params[0] != "CHARACTER" && params[0] != "INSTANCE_CHARACTER"))
    {
        return -1;
    }
    else if(params[0] != "CHARACTER" && params[0] != "INSTANCE_CHARACTER")
    {
        worldCID = 0;
    }

    local flagSource = null;
    if(params[0] == "ZONE" || params[0] == "CHARACTER")
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

    if(action.GetZoneID())
    {
        local zoneID = action.GetZoneID() +
            flagSource.GetFlagState(params[1].tointeger(), 0, worldCID);
        action.SetZoneID(zoneID);
    }
    else
    {
        local zoneID = zone.GetDefinitionID().tointeger() +
            params[1].tointeger();
        action.SetZoneID(zoneID);
    }

    if(params.len() > 2)
    {
        local spotID = flagSource.GetFlagState(params[2].tointeger(), 0,
            worldCID);
        action.SetSpotID(spotID);
    }

    return 0;
}