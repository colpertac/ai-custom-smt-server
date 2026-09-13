function define(script)
{
    script.Name = "transforma_clearItems";
    script.Type = "ActionTransform";
    return 0;
}

// Transform an ActionAddRemoveItems command by removing all of the supplied
// item types the current character has in their inventory
// - params[0]+: Item types to remove
function transform(source, cState, dState, zone, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    if(character == null || params.len() < 1)
    {
        return -1;
    }

    local inventory = character.GetItemBoxesByIndex(0).Get();
    if(inventory == null)
    {
        // Should never happen
        return -1;
    }

    for(local i = 0; i < params.len(); i++)
    {
        local itemType = params[i].tointeger();
        local itemCount = 0;
        for(local k = 0; k < 50; k++)
        {
            local item = inventory.GetItemsByIndex(k).Get();
            if(item && item.GetType() == itemType)
            {
                itemCount -= item.GetStackSize();
            }
        }

        if(itemCount < 0)
        {
            action.SetItemsEntry(itemType, itemCount);
        }
    }

    return 0;
}