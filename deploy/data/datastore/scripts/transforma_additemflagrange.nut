function define(script)
{
    script.Name = "transforma_addItemFlagRange";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionAddRemoveItems command based on zone character flags
// starting at a specified range. Range stops being read once a zero is
// encountered.
// - params[0]: Starting flag key
// - params[1]: Designates flag options. If 1, flags are cleared after read.
//   If 2, item counts use a range of min to max.
function transform(source, cState, dState, zone, params)
{
    local worldCID = cState != null ? cState.GetWorldCID() : 0;
    if(params.len() < 1 || zone == null || worldCID == 0)
    {
        return -1;
    }

    local key = params[0].tointeger();
    local clearKeys = params.len() > 1 && (params[1].tointeger() & 1) != 0;
    local minMax = params.len() > 1 && (params[1].tointeger() & 2) != 0;
    while(zone.GetFlagState(key, 0, worldCID) != 0 && zone.GetFlagState(key + 1, 0, worldCID) != 0 &&
        (!minMax || zone.GetFlagState(key + 2, 0, worldCID) != 0))
    {
        local itemType = zone.GetFlagState(key, 0, worldCID);
        local count = zone.GetFlagState(key + 1, 0, worldCID);

        if(clearKeys)
        {
            zone.SetFlagState(key, 0, worldCID);
            zone.SetFlagState(key + 1, 0, worldCID);
        }

        key += 2;

        if(minMax)
        {
            count = Randomizer.RNG(count, zone.GetFlagState(key, 0, worldCID));

            if(clearKeys)
            {
                zone.SetFlagState(key, 0, worldCID);
            }

            key++;
        }

        action.SetItemsEntry(itemType, count);
    }

    return 0;
}