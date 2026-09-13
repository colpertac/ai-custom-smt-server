function define(script)
{
    script.Name = "transforma_keepRandomKey";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionAddRemoveItems or ActionUpdateCOMP command by keeping
// only one random key.
// - params[0]+: Optional keys to take out of the selected set and keep as well
function transform(source, cState, dState, zone, params)
{
    if(action.ActionType == Action_actionType_t.ADD_REMOVE_ITEMS)
    {
        local keep = [];
        for(local i = 0; i < params.len(); i++)
        {
            keep.append(action.GetItemsByKey(params[i].tointeger()));
            action.RemoveItems(params[i].tointeger());
        }

        local keys = action.GetItemsKeys();
        if(keys.len() > 0)
        {
            local key = keys[Randomizer.RNG(0, keys.len() - 1)];
            local value = action.GetItemsByKey(key);
            action.ClearItems();
            action.SetItemsEntry(key, value);
        }

        for(local i = 0; i < params.len(); i++)
        {
            action.SetItemsEntry(params[i].tointeger(), keep[i]);
        }
    }
    else if(action.ActionType == Action_actionType_t.ADD_REMOVE_STATUS)
    {
        local keep = [];
        for(local i = 0; i < params.len(); i++)
        {
            keep.append(action.GetStatusStacksByKey(params[i].tointeger()));
            action.RemoveStatusStacks(params[i].tointeger());
        }

        local keys = action.GetStatusStacksKeys();
        if(keys.len() > 0)
        {
            local key = keys[Randomizer.RNG(0, keys.len() - 1)];
            local value = action.GetStatusStacksByKey(key);
            action.ClearStatusStacks();
            action.SetStatusStacksEntry(key, value);
        }

        for(local i = 0; i < params.len(); i++)
        {
            action.SetStatusStacksEntry(params[i].tointeger(), keep[i]);
        }
    }
    else if(action.ActionType == Action_actionType_t.UPDATE_COMP)
    {
        local keep = [];
        for(local i = 0; i < params.len(); i++)
        {
            keep.append(action.GetAddDemonsByKey(params[i].tointeger()));
            action.RemoveAddDemons(params[i].tointeger());
        }

        local keys = action.GetAddDemonsKeys();
        if(keys.len() > 0)
        {
            local key = keys[Randomizer.RNG(0, keys.len() - 1)];
            local value = action.GetAddDemonsByKey(key);
            action.ClearAddDemons();
            action.SetAddDemonsEntry(key, value);
        }

        for(local i = 0; i < params.len(); i++)
        {
            action.SetAddDemonsEntry(params[i].tointeger(), keep[i]);
        }
    }
    else
    {
        return -1;
    }

    return 0;
}