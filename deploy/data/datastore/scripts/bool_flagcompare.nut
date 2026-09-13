function define(script)
{
    script.Name = "bool_flagCompare";
    script.Type = "EventCondition";
    return 0;
}

// Check if the values of two zone flags match
// - value1: Flag key 1
// - value2: Flag key 2
// - params[0]: Flag types: ZONE (default), INSTANCE, CHARACTER or
//   INSTANCE_CHARACTER
// - params[1]: INVENTORY, EVENT_COUNTER or optional dynamic flag types: ZONE,
//   INSTANCE, CHARACTER, INSTANCE_CHARACTER. If INVENTORY, the flag value must
//   exceed the amount of space left in the inventory. If EVENT_COUNTER, the
//   flag value must be greater than or equal to the counter matching value2.
//   Otherwise if set, take the value from value1's flag and use it as a key
//   of this type to compare against value2 directly (useful for dynamic flag
//   checking)
function check(source, cState, dState, zone, value1, value2, params)
{
    if(zone == null)
    {
        return -1;
    }

    local fType = params.len() >= 1 ? params[0] : "ZONE";
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(fType != "ZONE" && fType != "INSTANCE" && fType != "CHARACTER" &&
        fType != "INSTANCE_CHARACTER")
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

    if(params.len() == 2 && params[1] == "INVENTORY")
    {
        local character = cState != null ? cState.GetEntity() : null;
        local inventory = character != null
            ? character.GetItemBoxesByIndex(0).Get() : null;
        if(inventory == null)
        {
            return -1;
        }

        local emptyCount = 0;
        for(local i = 0; i < 50; i++)
        {
            local item = inventory.GetItemsByIndex(i).Get();
            if(item == null)
            {
                emptyCount++;
            }
        }

        return emptyCount >= flagSource.GetFlagState(value1, 0, worldCID)
            ? 0 : -1;
    }
    else if(params.len() == 2 && params[1] == "EVENT_COUNTER")
    {
        local counter = cState.GetEventCounter(value2, false);
        return flagSource.GetFlagState(value1, 0, worldCID) >=
            (counter != null ? counter.GetCounter() : 0) ? 0 : -1;
    }
    else if(params.len() == 2)
    {
        local dynamicKey = flagSource.GetFlagState(value1, 0, worldCID);

        // Get the world CID for the new source
        worldCID = cState != null ? cState.GetWorldCID() : 0;
        if(params[1] != "CHARACTER" && params[1] != "INSTANCE_CHARACTER")
        {
            worldCID = 0;
        }

        local val = 0;
        if(params[1] == "ZONE" || params[1] == "CHARACTER")
        {
            val = zone.GetFlagState(dynamicKey, 0, worldCID);
        }
        else if(params[1] == "INSTANCE" || params[1] == "INSTANCE_CHARACTER")
        {
            local inst = zone.GetZoneInstance();
            if(inst == null)
            {
                return -1;
            }

            val = inst.GetFlagState(dynamicKey, 0, worldCID);
        }
        else
        {
            return -1;
        }

        return val == value2 ? 0 : -1;
    }
    else
    {
        return flagSource.GetFlagState(value1, 0, worldCID) ==
            flagSource.GetFlagState(value2, 0, worldCID) ? 0 : -1;
    }
}