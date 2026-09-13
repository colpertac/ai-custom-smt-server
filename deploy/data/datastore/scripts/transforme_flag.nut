function define(script)
{
    script.Name = "transforme_flag";
    script.Type = "EventTransform";
    return 0;
}

// Apply zone or zone instance flag value to an EventExNPCMessage
// - params[0]: Flag key
// - params[1]: ZONE, INSTANCE, CHARACTER or INSTANCE_CHARACTER for flag type
//   to set
function transform(source, cState, dState, zone, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(params.len() < 2 || zone == null ||
        (params[1] != "ZONE" && params[1] != "INSTANCE" &&
        params[1] != "CHARACTER" && params[1] != "INSTANCE_CHARACTER"))
    {
        return -1;
    }
    else if(params[1] != "CHARACTER" && params[1] != "INSTANCE_CHARACTER")
    {
        worldCID = 0;
    }

    local flagSource = null;
    if(params[1] == "ZONE" || params[1] == "CHARACTER")
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

    event.SetMessageValue(flagSource.GetFlagState(params[0].tointeger(), 0, worldCID));

    return 0;
}