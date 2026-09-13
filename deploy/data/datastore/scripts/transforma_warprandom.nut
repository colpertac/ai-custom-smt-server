function define(script)
{
    script.Name = "transforma_warpRandom";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionZoneChange command to use the key values from two flags for the zoneID/spotID pair.
// - params[0]: Flag type: ZONE, INSTANCE, CHARACTER or
//   INSTANCE_CHARACTER
// - params[1]: Flag key to use for starting spotID
// - params[2]: Maximum random value
// - params[3]: Multiplier for random number
// - params[4]: Flag key to use for excluded spotID
function transform(source, cState, dState, zone, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(params.len() < 4 || zone == null ||
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

    local maxRNG = (flagSource.GetFlagState(params[2].tointeger(), 0, worldCID).tointeger()) - 1;
    local multiplier = flagSource.GetFlagState(params[3].tointeger(), 0, worldCID).tointeger();
    local selected = Randomizer.RNG(0, maxRNG);
    local baseSpotID = flagSource.GetFlagState(params[1].tointeger(), 0, worldCID).tointeger();
    local spotID = (baseSpotID + (selected * multiplier));
    local excludedSpotID = -1;
    if(params.len() >= 5)
    {
        local excludedSpotID = flagSource.GetFlagState(params[4].tointeger(), 0, worldCID).tointeger();    
    }

    if(excludedSpotID == spotID)
    {
        //more than the maximum allowed spotID
        if(spotID + multiplier >= baseSpotID + (maxRNG * multiplier))
        {
            spotID -= multiplier;
        }
        else
        {
            spotID += multiplier;
        }
    }
	print(spotID);
	print(multiplier);
	print(selected);
    action.SetSpotID(spotID);

    return 0;
}